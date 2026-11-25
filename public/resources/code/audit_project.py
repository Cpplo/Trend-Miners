"""Audit the supplied archive without loading executable pickle/joblib artifacts."""
import argparse
import ast
import csv
import hashlib
import io
import json
import struct
import unicodedata
import zipfile
from collections import Counter, defaultdict
from pathlib import Path


def normalize(text):
    return ' '.join(unicodedata.normalize('NFKC', text or '').casefold().split())


def text_key(text):
    text = normalize(text)
    return hashlib.sha256(text.encode('utf-8')).hexdigest() if text else None


def numeric_npy(payload):
    stream = io.BytesIO(payload)
    if stream.read(6) != b'\x93NUMPY':
        raise ValueError('Invalid NPY header')
    version = stream.read(2)[0]
    size = 2 if version == 1 else 4
    length = int.from_bytes(stream.read(size), 'little')
    header = ast.literal_eval(stream.read(length).decode('latin1'))
    codes = {'<i8': 'q', '<i4': 'i', '<f8': 'd', '<f4': 'f'}
    if header['descr'] not in codes or header['fortran_order']:
        raise ValueError('Unsupported numeric array')
    values = [v[0] for v in struct.iter_unpack('<' + codes[header['descr']], stream.read())]
    return values


def metrics(matrix):
    total = sum(map(sum, matrix))
    classes = []
    for i, row in enumerate(matrix):
        support, predicted = sum(row), sum(r[i] for r in matrix)
        p = row[i] / predicted if predicted else 0
        r = row[i] / support if support else 0
        classes.append({'precision': p, 'recall': r, 'f1': 2*p*r/(p+r) if p+r else 0, 'support': support})
    return {'accuracy': sum(matrix[i][i] for i in range(3))/total,
            'macro_f1': sum(c['f1'] for c in classes)/3, 'per_class': classes, 'matrix': matrix}


def audit(archive_path):
    archive_path = Path(archive_path)
    with archive_path.open('rb') as source:
        digest = hashlib.file_digest(source, 'sha256').hexdigest()
    result = {'archive': archive_path.name, 'archive_sha256': digest,
              'normalization': 'Unicode NFKC, casefold, whitespace collapse; hashes only in memory',
              'code_files': [], 'splits': {}}
    keys = {}
    test_truth = []
    with zipfile.ZipFile(archive_path) as archive:
        names = archive.namelist()
        result['code_files'] = [n for n in names if n.endswith(('.py', '.ipynb'))]
        for split in ['train', 'test']:
            name = next(n for n in names if n.endswith('/data/' + split + '_clean_en.csv'))
            counters = {'review_body': Counter(), 'review_clean_en': Counter()}
            labelsets = {k: defaultdict(set) for k in counters}
            blanks = Counter(); rating_counts = Counter(); mismatches = 0; n = 0; thai_chars = 0
            with archive.open(name) as source:
                for row in csv.DictReader(io.TextIOWrapper(source, encoding='utf-8-sig')):
                    rating = int(row['star_rating']); label = int(row['label_3'])
                    expected = 0 if rating <= 2 else 1 if rating == 3 else 2
                    mismatches += expected != label
                    rating_counts[rating] += 1; n += 1
                    if split == 'test': test_truth.append(label)
                    thai_chars += sum('\u0e00' <= c <= '\u0e7f' for c in row.get('review_body', ''))
                    for field in counters:
                        key = text_key(row.get(field, ''))
                        if key is None: blanks[field] += 1
                        else:
                            counters[field][key] += 1
                            labelsets[field][key].add(label)
            result['splits'][split] = {'rows': n, 'rating_counts': dict(rating_counts),
                'label_mapping_mismatches': mismatches, 'thai_characters_in_original_column': thai_chars,
                'blank_text_rows': dict(blanks), 'duplicates': {
                    k: {'unique_texts': len(v), 'extra_repeated_rows': sum(v.values())-len(v),
                        'conflicting_label_groups': sum(len(s)>1 for s in labelsets[k].values())}
                    for k,v in counters.items()}}
            keys[split] = counters
        result['train_test_overlap'] = {}
        for field in keys['train']:
            overlap = keys['train'][field].keys() & keys['test'][field].keys()
            result['train_test_overlap'][field] = {'shared_unique_texts': len(overlap),
                'affected_train_rows': sum(keys['train'][field][k] for k in overlap),
                'affected_test_rows': sum(keys['test'][field][k] for k in overlap)}
        name = next(n for n in names if n.endswith('/outputs/best_model_preds.npz'))
        with zipfile.ZipFile(io.BytesIO(archive.read(name))) as arrays:
            true = numeric_npy(arrays.read('y_true.npy'))
            pred = numeric_npy(arrays.read('y_pred.npy'))
        if len(true) != len(pred) or true != test_truth:
            raise ValueError('Prediction rows do not match supplied test labels in order')
        if set(true + pred) - {0,1,2}:
            raise ValueError('Unexpected class code')
        matrix = [[0]*3 for _ in range(3)]
        for actual, predicted in zip(true, pred): matrix[actual][predicted] += 1
        result['prediction_order_matches_test_csv'] = True
        result['selected_model'] = metrics(matrix)
        training_counts = Counter()
        for rating,count in result['splits']['train']['rating_counts'].items():
            training_counts[0 if int(rating)<=2 else 1 if int(rating)==3 else 2] += count
        majority = training_counts.most_common(1)[0][0]
        majority_matrix = [[0]*3 for _ in range(3)]
        for actual in test_truth: majority_matrix[actual][majority] += 1
        result['training_majority_class'] = majority
        result['majority_baseline'] = metrics(majority_matrix)
        bundle_name = next(n for n in names if n.endswith('/outputs/reviewlab_bundle.json'))
        bundle = json.loads(archive.read(bundle_name))
        result['export_checks'] = {key: abs(result['selected_model'][key]-bundle['best_model']['best_metrics_3class'][key]) < 0.000051 for key in ['accuracy','macro_f1']}
        if not all(result['export_checks'].values()): raise ValueError('Export and prediction metrics differ')
    result['limitations'] = ['Training code, source release, and translation provenance absent',
        'Text overlap identifies evaluation risk; it does not prove how features or thresholds were fitted',
        'Existing test results were previously inspected; a rerun is exploratory, not a new untouched evaluation']
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', default='Latest_Update.zip')
    parser.add_argument('--output', default='experiments/outputs/data_audit.json')
    args = parser.parse_args()
    result = audit(args.archive)
    destination = Path(args.output); destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result, indent=2))
