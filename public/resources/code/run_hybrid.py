"""Fresh, exploratory LR versus TF-IDF + K-Means distance experiment.

Uses supplied English-cleaned CSVs, not the archive's executable model files.
This is a new documented implementation, not a reproduction of missing code.
"""
import argparse
import csv
import hashlib
import io
import json
import platform
import warnings
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from audit_project import text_key


def load_rows(stream):
    rows=[]
    for index,row in enumerate(csv.DictReader(stream)):
        if not {'review_body','review_clean_en','star_rating'} <= row.keys():
            raise ValueError('CSV requires review_body, review_clean_en, star_rating columns')
        rating=int(row['star_rating'])
        if rating not in range(1,6): raise ValueError('Rating must be 1..5')
        label=0 if rating<=2 else 1 if rating==3 else 2
        if 'label_3' in row and int(row['label_3']) != label:
            raise ValueError('Rating and label_3 disagree')
        rows.append({'index':index,'text':row['review_clean_en'], 'key':text_key(row['review_clean_en']),
                     'raw_key':text_key(row['review_body']), 'label':label})
    return rows


def load_csv(path):
    with Path(path).open(encoding='utf-8-sig',newline='') as source: return load_rows(source)


def load_archive(path,split):
    with zipfile.ZipFile(path) as archive:
        name=next(n for n in archive.namelist() if n.endswith('/data/'+split+'_clean_en.csv'))
        with archive.open(name) as source: return load_rows(io.TextIOWrapper(source,encoding='utf-8-sig'))


def grouped_ids(rows):
    # Union both original-text matches and cleaned-English matches.
    parents=list(range(len(rows)))
    def find(i):
        while parents[i]!=i:
            parents[i]=parents[parents[i]];i=parents[i]
        return i
    seen={}
    for i,row in enumerate(rows):
        for field in ['key','raw_key']:
            key=(field,row[field])
            if row[field] is None: continue
            if key in seen: parents[find(i)]=find(seen[key])
            else: seen[key]=i
    return [find(i) for i in range(len(rows))]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive',default='Latest_Update.zip')
    parser.add_argument('--train-csv');parser.add_argument('--test-csv')
    parser.add_argument('--source-name',default='Wongnai archive (release unconfirmed)')
    parser.add_argument('--target-csv');parser.add_argument('--target-name')
    parser.add_argument('--clusters',type=int,default=16,help='Prespecified K; do not select using test results')
    parser.add_argument('--seed',type=int,default=42)
    parser.add_argument('--output',default='experiments/outputs/hybrid_rerun')
    args=parser.parse_args()
    if bool(args.train_csv)!=bool(args.test_csv):parser.error('Provide both --train-csv and --test-csv')
    if bool(args.target_csv)!=bool(args.target_name):parser.error('Target CSV requires a confirmed --target-name')
    if args.clusters<2:parser.error('--clusters must be >=2')
    try:
        import numpy as np
        import scipy
        import sklearn
        from scipy import sparse
        from sklearn.cluster import KMeans
        from sklearn.exceptions import ConvergenceWarning
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.linear_model import LogisticRegression
        from sklearn.metrics import accuracy_score,classification_report,confusion_matrix,f1_score
        from sklearn.model_selection import StratifiedGroupKFold
        from sklearn.preprocessing import StandardScaler
    except ImportError as exc:
        raise SystemExit('Install requirements first: python -m pip install -r experiments/requirements.txt') from exc
    # A failed convergence check invalidates the trial rather than silently publishing it.
    warnings.simplefilter('error',ConvergenceWarning)
    train=load_csv(args.train_csv) if args.train_csv else load_archive(args.archive,'train')
    test=load_csv(args.test_csv) if args.test_csv else load_archive(args.archive,'test')
    target=load_csv(args.target_csv) if args.target_csv else []
    output=Path(args.output)
    if (output/'experiment.json').exists():
        raise SystemExit('Output already contains a run. Use --output with a new directory to preserve it.')
    output.mkdir(parents=True,exist_ok=True)
    removed=Counter()
    evaluation_rows=test+target
    blocked={field:{r[field] for r in evaluation_rows if r[field]} for field in ['key','raw_key']}
    retained=[];seen=set()
    for row in train:
        if not row['key']:removed['blank_training_text']+=1;continue
        if any(row[field] and row[field] in blocked[field] for field in blocked):
            removed['training_overlap_with_evaluation_text']+=1;continue
        pair=(row['key'],row['label'])
        if pair in seen:removed['repeated_clean_text_and_label']+=1;continue
        seen.add(pair);retained.append(row)
    train=retained
    # Keep the complete test set (including empty texts) so test support is explicit.
    groups=np.asarray(grouped_ids(train))
    y=np.asarray([r['label'] for r in train])
    text=np.asarray([r['text'] for r in train],dtype=object)
    if set(y)!={0,1,2} or min(Counter(y).values())<5:
        raise ValueError('Need all three classes with at least five training examples each')
    splitter=StratifiedGroupKFold(n_splits=5,shuffle=True,random_state=args.seed)
    fit_idx,val_idx=next(splitter.split(text,y,groups))
    if set(y[fit_idx])!={0,1,2} or set(y[val_idx])!={0,1,2}:
        raise ValueError('Validation split lacks a class; revise the prespecified grouping protocol')
    assert not(set(groups[fit_idx]) & set(groups[val_idx]))
    vectorizer_args={'ngram_range':(1,2),'min_df':2,'max_features':50000,'sublinear_tf':True,'dtype':np.float64}
    def vectorizer():return TfidfVectorizer(**vectorizer_args)
    def clusterer():return KMeans(n_clusters=args.clusters,n_init=10,max_iter=300,random_state=args.seed,algorithm='lloyd')
    def classifier(c):return LogisticRegression(C=c,class_weight='balanced',solver='lbfgs',max_iter=3000,random_state=args.seed)
    def combined(x,km,scaler,fit=False):
        distances=km.transform(x)
        distances=scaler.fit_transform(distances) if fit else scaler.transform(distances)
        return sparse.hstack([x,sparse.csr_matrix(distances)],format='csr')
    vec=vectorizer();x_fit=vec.fit_transform(text[fit_idx]);x_val=vec.transform(text[val_idx])
    if args.clusters>=len(fit_idx):raise ValueError('K exceeds training-fold sample count')
    km=clusterer();km.fit(x_fit)
    scaler=StandardScaler();h_fit=combined(x_fit,km,scaler,True);h_val=combined(x_val,km,scaler)
    trials=[];best={}
    # Equal model-selection budget: the same three C values per arm; K is fixed in advance.
    for arm,a,b in [('ordinary_lr',x_fit,x_val),('kmeans_distance_lr',h_fit,h_val)]:
        candidates=[]
        for c in [0.1,1.0,10.0]:
            model=classifier(c);model.fit(a,y[fit_idx]);pred=model.predict(b)
            score=float(f1_score(y[val_idx],pred,labels=[0,1,2],average='macro',zero_division=0))
            trials.append({'arm':arm,'C':c,'validation_macro_f1':score})
            candidates.append((score,-c,c))
        best[arm]=max(candidates)[2]
    # Refit all learned components on development data after model selection; no test fitting.
    vec=vectorizer();x_train=vec.fit_transform(text)
    km=clusterer();km.fit(x_train);scaler=StandardScaler();h_train=combined(x_train,km,scaler,True)
    models={}
    for arm,x in [('ordinary_lr',x_train),('kmeans_distance_lr',h_train)]:
        model=classifier(best[arm]);model.fit(x,y);models[arm]=model
    majority=int(Counter(y).most_common(1)[0][0])
    results=[]
    for target_name,rows in [(args.source_name,test)]+([(args.target_name,target)] if target else []):
        truth=np.asarray([r['label'] for r in rows]);x=vec.transform([r['text'] for r in rows]);h=combined(x,km,scaler)
        for arm,features in [('ordinary_lr',x),('kmeans_distance_lr',h),('training_majority',None)]:
            predictions=np.full(len(rows),majority) if features is None else models[arm].predict(features)
            results.append({'source':args.source_name,'target':target_name,'arm':arm,'support':len(rows),
                'accuracy':float(accuracy_score(truth,predictions)),
                'macro_f1':float(f1_score(truth,predictions,labels=[0,1,2],average='macro',zero_division=0)),
                'per_class':classification_report(truth,predictions,labels=[0,1,2],target_names=['Negative','Neutral','Positive'],output_dict=True,zero_division=0),
                'confusion_matrix':confusion_matrix(truth,predictions,labels=[0,1,2]).tolist()})
        filename='within_platform_predictions.npz' if rows is test else 'transfer_predictions.npz'
        np.savez_compressed(output/filename,y_true=truth,ordinary_lr=models['ordinary_lr'].predict(x),hybrid_lr=models['kmeans_distance_lr'].predict(h))
    source_results=[r for r in results if r['target']==args.source_name]
    delta=next(r['macro_f1'] for r in source_results if r['arm']=='kmeans_distance_lr')-next(r['macro_f1'] for r in source_results if r['arm']=='ordinary_lr')
    report={'created_utc':datetime.now(timezone.utc).isoformat(),'new_implementation':True,
        'status':'Exploratory rerun; original test results were already inspected',
        'seed':args.seed,'clusters_prespecified':args.clusters,'C_candidates':[0.1,1.0,10.0],
        'selected_C':best,'class_weight':'balanced','tfidf':{k:str(v) for k,v in vectorizer_args.items()},
        'split':'First fold of 5-fold StratifiedGroupKFold used as fixed validation; NOT averaged cross-validation',
        'development_rows':len(train),'fit_rows':len(fit_idx),'validation_rows':len(val_idx),'removed_training_rows':dict(removed),
        'training_row_indices':[r['index'] for r in train],'fit_indices':fit_idx.tolist(),'validation_indices':val_idx.tolist(),
        'versions':{'python':platform.python_version(),'numpy':np.__version__,'scipy':scipy.__version__,'sklearn':sklearn.__version__},
        'validation_trials':trials,'results':results,'hybrid_minus_ordinary_macro_f1':delta,
        'limitations':['Translation provenance and source release require external confirmation',
            'Fixed historical test set is exploratory, not newly untouched',
            'No claim of reproducing the old missing training implementation',
            'Distance features are scaled; TF-IDF features retain their L2 normalization',
            'No statistical significance or guaranteed hybrid improvement claimed']}
    if not args.train_csv:
        with Path(args.archive).open('rb') as source:report['archive_sha256']=hashlib.file_digest(source,'sha256').hexdigest()
    else:
        report['source_csv_sha256']={}
        for filename in [args.train_csv,args.test_csv]:
            with Path(filename).open('rb') as source:report['source_csv_sha256'][filename]=hashlib.file_digest(source,'sha256').hexdigest()
    if args.target_csv:
        with Path(args.target_csv).open('rb') as source:report['target_csv_sha256']=hashlib.file_digest(source,'sha256').hexdigest()
    (output/'experiment.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    with (output/'metrics.csv').open('w',newline='',encoding='utf-8') as stream:
        writer=csv.DictWriter(stream,fieldnames=['source','target','arm','support','accuracy','macro_f1'],extrasaction='ignore')
        writer.writeheader();writer.writerows(results)
    print(json.dumps({'output':str(output),'hybrid_minus_ordinary_macro_f1':delta,'results':[{k:r[k] for k in ['source','target','arm','accuracy','macro_f1']} for r in results]},indent=2))


if __name__=='__main__':main()
