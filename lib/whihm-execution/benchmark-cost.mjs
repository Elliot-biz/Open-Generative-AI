// Exact factual sums, never price estimation or a project ledger.
const units=value=>{
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>Number.MAX_SAFE_INTEGER)return null;
  const [mantissa,exponent='0']=String(value).split('e'),[whole,fraction='']=mantissa.split('.'),shift=12+Number(exponent)-fraction.length;
  return shift<0?null:BigInt(whole+fraction)*10n**BigInt(shift);
};
const decimal=value=>{const s=value.toString().padStart(13,'0');return `${s.slice(0,-12)}.${s.slice(-12)}`.replace(/\.?0+$/,'')||'0';};
export function nativeCostEvidence(native) {
  if(native===null||native===undefined)return {status:'not_reported',native:null,aggregatable:false};
  const known=native&&typeof native==='object'&&!Array.isArray(native)&&Object.keys(native).length===2&&Object.hasOwn(native,'amount')&&Object.hasOwn(native,'currency')&&units(native.amount)!==null&&typeof native.currency==='string'&&/^[A-Z]{3}$/.test(native.currency);
  return {status:'reported',native:structuredClone(native),aggregatable:Boolean(known),...(known?{amount:native.amount,currency:native.currency}:{})};
}
export function sumReportedCosts(attempts) {
  if(!attempts.length)return {status:'not_applicable',attemptCount:0,amount:null,exactAmount:null,currency:null};
  const missing=attempts.filter(a=>!a.evidence.cost.aggregatable).map(a=>a.attemptId),currencies=[...new Set(attempts.filter(a=>a.evidence.cost.aggregatable).map(a=>a.evidence.cost.currency))].sort();
  if(missing.length||currencies.length!==1)return {status:'incomplete',attemptCount:attempts.length,amount:null,exactAmount:null,currency:null,missingAttemptIds:missing,reasons:[...(missing.length?['COST_EVIDENCE_INCOMPLETE']:[]),...(currencies.length>1?['CURRENCY_MISMATCH']:[])]};
  const total=attempts.reduce((sum,a)=>sum+units(a.evidence.cost.amount),0n),exactAmount=decimal(total),numeric=Number(exactAmount);
  return {status:'complete',attemptCount:attempts.length,amount:units(numeric)===total?numeric:null,exactAmount,currency:currencies[0]};
}
export function costThroughAcceptance(attempts,states) {
  const index=attempts.findIndex(a=>states.includes(a.evaluations.at(-1)?.assessment.acceptance));
  return index<0?{status:'not_reached',attemptCount:0,amount:null,exactAmount:null,currency:null}:sumReportedCosts(attempts.slice(0,index+1));
}
