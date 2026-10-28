// Only a boolean crosses from the existing MuAPI credential owner into page state.
export function muapiPresence(owner=globalThis) {
  try {return Boolean(owner.window?.__MUAPI_KEY__ || owner.localStorage?.getItem('muapi_key'));}
  catch {return null;}
}
export function providerStatus(provider) {
  if(provider.id==='muapi'&&provider.uiPresence!==undefined)return provider.uiPresence===null?'UNKNOWN':provider.uiPresence?'PRESENT / UNVERIFIED':'NOT CONFIGURED';
  if(provider.configuration==='NOT_CONFIGURED')return 'NOT CONFIGURED';
  if(provider.configuration==='CONFIGURED'&&provider.readiness.state==='UNVERIFIED')return 'CONFIGURED / UNVERIFIED';
  return provider.readiness.state;
}
export function safeProviderLink(url){return url==='https://muapi.ai/access-keys';}
