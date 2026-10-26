import {DEFAULT_LOCALE,isLocale} from '@/i18n/config';
import {getUiText,getUiAliases,uiMessages} from '@/i18n/ui';

const machineErrors:Record<string,string>={
 unsupported_model_or_task:'This model does not support the structured JSON response task.',
 provider_unavailable:'The selected provider is not available for this account.',
 unknown_cost_under_budget:'This provider does not report request costs, so I cannot safely enforce the active USD limit. Turn off the limit or choose a provider that reports costs.',
 budget_limit:'The daily or monthly AI budget limit does not allow this request.',
 connection_test_failed:'Connection test failed. Check the saved provider settings and key.',
};

/** Localize only error envelopes; successful responses may contain private user prose. */
export async function localizeApiErrorResponse(request:Request,response:Response):Promise<Response>{
 if(response.ok||!response.headers.get('content-type')?.includes('application/json'))return response;
 const body:unknown=await response.clone().json().catch(()=>null);
 if(!body||typeof body!=='object'||!('error' in body)||typeof body.error!=='string')return response;
 const cookie=request.headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith('ispatla-locale='))?.slice('ispatla-locale='.length);
 const locale=cookie&&isLocale(cookie)?cookie:DEFAULT_LOCALE;
 const machineMessage=Object.hasOwn(machineErrors,body.error)?machineErrors[body.error]:null;
 if(machineMessage){
  const headers=new Headers(response.headers);headers.delete('content-length');
  return Response.json({...body,message:getUiText(locale,machineMessage)},{status:response.status,statusText:response.statusText,headers});
 }
 // Database diagnostics contain SQL and bound parameters, potentially including private content.
 const diagnostic=/(?:failed query:|\bparams:|SQLSTATE|duplicate key value|violates .{0,80}constraint|relation .{0,100} does not exist)/i.test(body.error);
 const approval=/^draft #(\d+): kalite kontrolü ve insan onayı gerekli$/.exec(body.error);
 const recognized=Object.hasOwn(uiMessages,body.error)||Object.hasOwn(getUiAliases(),body.error);
 const error=approval&&!diagnostic
  ?getUiText(locale,'Draft #{id}: quality checks and human approval are required.',{id:approval[1]})
  :getUiText(locale,diagnostic||!recognized?'The request could not be completed. Please try again.':body.error);
 if(error===body.error)return response;
 const headers=new Headers(response.headers);headers.delete('content-length');
 return Response.json({...body,error},{status:response.status,statusText:response.statusText,headers});
}
