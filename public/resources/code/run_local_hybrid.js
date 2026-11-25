// Standalone exploratory experiment. No archive model/pickle is executed.
// Objective: weighted multinomial logistic loss + lambda/2 * sum(weights^2).
// Optimizer: fixed-budget stochastic gradient descent with lazy L2 shrinkage.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert');
function rng(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function shuffle(a,random){for(let i=a.length-1;i>0;i--){let j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function terms(text){const words=text.toLowerCase().match(/[a-z0-9_]{2,}/g)||[];const out=[...words];for(let i=1;i<words.length;i++)out.push(words[i-1]+' '+words[i]);return out;}
function vectorizer(texts,maxFeatures=20000){
 const df=new Map(),freq=new Map();
 for(const text of texts){const ts=terms(text);for(const t of ts)freq.set(t,(freq.get(t)||0)+1);for(const t of new Set(ts))df.set(t,(df.get(t)||0)+1);}
 const vocabulary=[...df.keys()].filter(t=>df.get(t)>=2).sort((a,b)=>freq.get(b)-freq.get(a)||(a<b?-1:a>b?1:0)).slice(0,maxFeatures).sort();
 if(!vocabulary.length)throw Error('Empty vocabulary');
 const index=new Map(vocabulary.map((t,i)=>[t,i]));
 const idf=Float64Array.from(vocabulary,t=>Math.log((1+texts.length)/(1+df.get(t)))+1);
 const transform=text=>{const counts=new Map();for(const t of terms(text)){const i=index.get(t);if(i!==undefined)counts.set(i,(counts.get(i)||0)+1);}
  const ix=[...counts.keys()].sort((a,b)=>a-b),values=ix.map(i=>(1+Math.log(counts.get(i)))*idf[i]);const norm=Math.sqrt(values.reduce((s,v)=>s+v*v,0))||1;
  return {ix:Int32Array.from(ix),v:Float64Array.from(values,v=>v/norm)};
 };
 return {vocabulary,idf,transform,dimension:vocabulary.length};
}
function dot(row,weights){let s=0;for(let j=0;j<row.ix.length;j++)s+=row.v[j]*weights[row.ix[j]];return s;}
function norm2(weights){let n=0;for(const v of weights)n+=v*v;return n;}
function rowNorm(row){let n=0;for(const v of row.v)n+=v*v;return n;}
function softmax(scores){const max=Math.max(...scores);const e=scores.map(s=>Math.exp(s-max)),sum=e.reduce((a,b)=>a+b,0);return e.map(v=>v/sum);}
function distances(row,centers,norms){const rnorm=rowNorm(row);return centers.map((c,i)=>Math.max(0,rnorm+norms[i]-2*dot(row,c)));}
function kmeans(rows,dimension,k,seed,maxIter=25){
 if(rows.length<k)throw Error('Too few rows for K');const random=rng(seed),centers=[];
 const toDense=row=>{const d=new Float64Array(dimension);for(let j=0;j<row.ix.length;j++)d[row.ix[j]]=row.v[j];return d;};
 centers.push(toDense(rows[Math.floor(random()*rows.length)]));
 const nearest=new Float64Array(rows.length).fill(Infinity);
 for(let c=1;c<k;c++){
  const last=centers[c-1],lastNorm=norm2(last);let sum=0;
  rows.forEach((r,i)=>{nearest[i]=Math.min(nearest[i],Math.max(0,rowNorm(r)+lastNorm-2*dot(r,last)));sum+=nearest[i];});
  let threshold=random()*sum,selected=rows.length-1;for(let i=0;i<rows.length;i++){threshold-=nearest[i];if(threshold<=0){selected=i;break;}}
  centers.push(toDense(rows[selected]));
 }
 let assignment=new Int32Array(rows.length).fill(-1),iterations=0,inertia=0;
 for(let iter=0;iter<maxIter;iter++){
  const norms=centers.map(norm2),sums=Array.from({length:k},()=>new Float64Array(dimension)),counts=new Int32Array(k);let changed=0;inertia=0;
  rows.forEach((r,i)=>{const ds=distances(r,centers,norms);let best=0;for(let c=1;c<k;c++)if(ds[c]<ds[best])best=c;
   if(assignment[i]!==best)changed++;assignment[i]=best;counts[best]++;inertia+=ds[best];const sum=sums[best];for(let j=0;j<r.ix.length;j++)sum[r.ix[j]]+=r.v[j];
  });
  for(let c=0;c<k;c++){
   if(counts[c]){for(let d=0;d<dimension;d++)centers[c][d]=sums[c][d]/counts[c];}
   else centers[c]=toDense(rows[Math.floor(random()*rows.length)]);
  }
  iterations=iter+1;if(iter%5===0)console.log(`K-Means iteration ${iter+1}: ${changed} assignments changed`);
  if(!changed)break;
 }
 const norms=centers.map(norm2);
 return {centers,iterations,inertia,transform:row=>Float64Array.from(distances(row,centers,norms),Math.sqrt)};
}
function fitScaler(rows,km){const values=rows.map(km.transform),k=km.centers.length,means=new Float64Array(k),std=new Float64Array(k);
 for(const v of values)for(let j=0;j<k;j++)means[j]+=v[j]/values.length;
 for(const v of values)for(let j=0;j<k;j++)std[j]+=(v[j]-means[j])**2/values.length;
 for(let j=0;j<k;j++)std[j]=Math.sqrt(std[j])||1;
 return {means,std};
}
function hybrid(rows,km,scaler,dimension){return rows.map(r=>{const d=km.transform(r),ix=new Int32Array(r.ix.length+d.length),v=new Float64Array(ix.length);ix.set(r.ix);v.set(r.v);
 for(let j=0;j<d.length;j++){ix[r.ix.length+j]=dimension+j;v[r.v.length+j]=(d[j]-scaler.means[j])/scaler.std[j];}return {ix,v};});}
function fitLR(rows,y,dimension,lambda,seed,epochs=25){
 const weights=Array.from({length:3},()=>new Float64Array(dimension)),bias=new Float64Array(3),counts=[0,0,0];y.forEach(c=>counts[c]++);
 if(counts.some(n=>!n))throw Error('Training class missing');const cw=counts.map(c=>y.length/(3*c));
 const order=Array.from({length:y.length},(_,i)=>i),random=rng(seed);let scale=1;const losses=[];
 for(let epoch=0;epoch<epochs;epoch++){
  shuffle(order,random);const rate=.05/(1+.2*epoch);let loss=0;
  for(const i of order){const row=rows[i],prob=softmax(weights.map((w,c)=>scale*dot(row,w)+bias[c]));loss-=cw[y[i]]*Math.log(Math.max(prob[y[i]],1e-15));
   scale*=1-rate*lambda;
   for(let c=0;c<3;c++){const gradient=cw[y[i]]*(prob[c]-(y[i]===c?1:0)),step=rate*gradient/scale;const w=weights[c];for(let j=0;j<row.ix.length;j++)w[row.ix[j]]-=step*row.v[j];bias[c]-=rate*gradient;}
   if(scale<1e-6){for(const w of weights)for(let d=0;d<dimension;d++)w[d]*=scale;scale=1;}
  }
  losses.push(loss/y.length);if(!Number.isFinite(loss))throw Error('Non-finite optimization loss');
 }
 for(const w of weights)for(let d=0;d<dimension;d++)w[d]*=scale;
 return {weights,bias,losses,predict:row=>{const s=weights.map((w,c)=>dot(row,w)+bias[c]);return s.indexOf(Math.max(...s));}};
}
function metrics(y,pred){const matrix=Array.from({length:3},()=>[0,0,0]);y.forEach((c,i)=>matrix[c][pred[i]]++);const perClass=matrix.map((r,i)=>{const support=r.reduce((a,b)=>a+b,0),nPred=matrix.reduce((s,r)=>s+r[i],0),precision=nPred?r[i]/nPred:0,recall=support?r[i]/support:0;return {precision,recall,f1:precision+recall?2*precision*recall/(precision+recall):0,support};});return {accuracy:matrix.reduce((s,r,i)=>s+r[i],0)/y.length,macro_f1:perClass.reduce((s,c)=>s+c.f1,0)/3,per_class:perClass,confusion_matrix:matrix,support:y.length};}
function main(){
 const seed=42,k=16,epochs=25,lambdas=[1e-5,1e-4,1e-3],out='experiments/outputs/local_hybrid';
 if(fs.existsSync(path.join(out,'experiment.json')))throw Error('Completed run exists; preserve it');fs.mkdirSync(out,{recursive:true});
 const data=JSON.parse(fs.readFileSync('experiments/work/english_inputs.json','utf8'));
 const blocked=new Set(data.test.flatMap(r=>[r.key,r.raw_key]).filter(Boolean)),seen=new Set(),removed={blank:0,overlap:0,duplicate_pair:0};
 const train=data.train.filter(r=>{if(!r.key){removed.blank++;return false;}if(blocked.has(r.key)||blocked.has(r.raw_key)){removed.overlap++;return false;}const pair=r.key+':'+r.label;if(seen.has(pair)){removed.duplicate_pair++;return false;}seen.add(pair);return true;});
 // Original Thai rows are unique in the audited archive. Group by matching English text.
 assert.equal(new Set(train.map(r=>r.raw_key)).size,train.length);
 const groupKeys=shuffle([...new Set(train.map(r=>r.key))],rng(seed)),validationKeys=new Set(groupKeys.slice(0,Math.ceil(groupKeys.length*.2)));
 const fit=train.filter(r=>!validationKeys.has(r.key)),val=train.filter(r=>validationKeys.has(r.key));
 for(const rows of [fit,val])assert.equal(new Set(rows.map(r=>r.label)).size,3);
 console.log(JSON.stringify({fit:fit.length,validation:val.length,test:data.test.length,removed}));
 let vec=vectorizer(fit.map(r=>r.text)),xfit=fit.map(r=>vec.transform(r.text)),xval=val.map(r=>vec.transform(r.text));
 let km=kmeans(xfit,vec.dimension,k,seed),scaler=fitScaler(xfit,km),hfit=hybrid(xfit,km,scaler,vec.dimension),hval=hybrid(xval,km,scaler,vec.dimension);
 const trials=[],selected={};
 for(const [arm,x,z,d]of [['ordinary_lr',xfit,xval,vec.dimension],['kmeans_distance_lr',hfit,hval,vec.dimension+k]]){
  let best=-Infinity;for(const lambda of lambdas){console.log(`Training ${arm}, lambda=${lambda}`);const model=fitLR(x,fit.map(r=>r.label),d,lambda,seed,epochs),m=metrics(val.map(r=>r.label),z.map(model.predict));
   trials.push({arm,lambda,...m,epoch_online_losses:model.losses});console.log(`Validation Macro-F1: ${m.macro_f1.toFixed(4)}`);
   if(m.macro_f1>best){best=m.macro_f1;selected[arm]=lambda;}
  }
 }
 fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify({trials,selected},null,2));
 // All learned transforms are now freshly fitted on development rows only.
 vec=vectorizer(train.map(r=>r.text));const xtrain=train.map(r=>vec.transform(r.text)),xtest=data.test.map(r=>vec.transform(r.text));
 km=kmeans(xtrain,vec.dimension,k,seed);scaler=fitScaler(xtrain,km);const htrain=hybrid(xtrain,km,scaler,vec.dimension),htest=hybrid(xtest,km,scaler,vec.dimension);
 const results=[],predictions={y_true:data.test.map(r=>r.label)};
 for(const [arm,x,z,d]of [['ordinary_lr',xtrain,xtest,vec.dimension],['kmeans_distance_lr',htrain,htest,vec.dimension+k]]){
  console.log(`Final refit: ${arm}`);const model=fitLR(x,train.map(r=>r.label),d,selected[arm],seed,epochs),pred=z.map(model.predict);
  results.push({arm,...metrics(predictions.y_true,pred),epoch_online_losses:model.losses});predictions[arm]=pred;
 }
 const counts=[0,0,0];train.forEach(r=>counts[r.label]++);const majority=counts.indexOf(Math.max(...counts));results.push({arm:'training_majority',...metrics(predictions.y_true,predictions.y_true.map(()=>majority))});
 const delta=results[1].macro_f1-results[0].macro_f1;
 const report={created_utc:new Date().toISOString(),implementation:'Standalone JavaScript; weighted multinomial logistic regression with SGD; full-batch Lloyd K-Means with one seeded k-means++ initialization',new_implementation:true,exploratory:true,source_archive_sha256:JSON.parse(fs.readFileSync('experiments/outputs/data_audit.json','utf8')).archive_sha256,seed,k_prespecified:k,epochs,lambda_candidates:lambdas,selected_lambda:selected,class_weight:'balanced',learning_rate:'0.05 / (1 + 0.2 * epoch)',validation:'Seeded random 20% holdout of unique normalized English-text groups; all 3 classes verified',tfidf:{ngrams:[1,2],max_features:20000,min_df:2,sublinear_tf:true,smooth_idf:true,norm:'l2',tokens:'lowercase ASCII alphanumeric/underscore sequences of length >=2'},distance_scaling:'training-only mean and population standard deviation',counts:{development:train.length,fit:fit.length,validation:val.length,test:data.test.length,removed},kmeans:{iterations:km.iterations,inertia:km.inertia,max_iterations:25,n_init:1},results,hybrid_minus_ordinary_macro_f1:delta,trials,split_indices:{retained_source_train:train.map(r=>r.index),fit_source_train:fit.map(r=>r.index),validation_source_train:val.map(r=>r.index)},node_version:process.version,limitations:['Fresh implementation; not a reproduction of the absent Python notebook','Historical test outcomes were already viewed; results are exploratory','Fixed 25-epoch SGD budget; not a claim of solver convergence','One seed and one prespecified K; no significance claim','Original source release and translation process unconfirmed','No confirmed Google Maps labels or transfer experiment']};
 fs.writeFileSync(path.join(out,'experiment.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(out,'predictions.json'),JSON.stringify(predictions));
 fs.writeFileSync(path.join(out,'metrics.csv'),'arm,accuracy,macro_f1,support\n'+results.map(r=>[r.arm,r.accuracy,r.macro_f1,r.support].join(',')).join('\n')+'\n');
 console.log(JSON.stringify({results:results.map(({arm,accuracy,macro_f1})=>({arm,accuracy,macro_f1})),hybrid_minus_ordinary_macro_f1:delta},null,2));
}
if(require.main===module)main();
module.exports={rng,terms,vectorizer,dot,softmax,kmeans,fitScaler,hybrid,fitLR,metrics};
