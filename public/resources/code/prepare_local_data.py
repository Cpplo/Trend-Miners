"""Prepare private working data for the dependency-free experiment."""
import csv, io, json, zipfile
from pathlib import Path
from audit_project import text_key

dest=Path('experiments/work'); dest.mkdir(parents=True,exist_ok=True)
data={}
with zipfile.ZipFile('Latest_Update.zip') as archive:
    for split in ['train','test']:
        name=next(n for n in archive.namelist() if n.endswith('/data/'+split+'_clean_en.csv'))
        rows=[]
        with archive.open(name) as source:
            for i,row in enumerate(csv.DictReader(io.TextIOWrapper(source,encoding='utf-8-sig'))):
                rating=int(row['star_rating'])
                label=0 if rating<=2 else 1 if rating==3 else 2
                assert int(row['label_3'])==label
                rows.append({'index':i,'text':row['review_clean_en'],'key':text_key(row['review_clean_en']),
                             'raw_key':text_key(row['review_body']),'label':label})
        data[split]=rows
(dest/'english_inputs.json').write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
print({k:len(v) for k,v in data.items()})
