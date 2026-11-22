import {createDatabaseClient} from '../packages/database/dist/index.js';

const issuer = new URL(process.env.AUTH_ISSUER);
if (!['localhost', '127.0.0.1'].includes(issuer.hostname) || process.env.POC_ADMIN_PASSWORD !== 'admin'
    || process.env.POC_USER_PASSWORD !== 'user') throw new Error('Local PoC seed configuration required');
async function api(route, options = {}) {
  const response = await fetch(issuer.origin + route, {...options, signal:AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error('PoC identity seed failed, HTTP '+response.status);
  return response.status===204 ? null : response.json();
}
const login = await api('/realms/master/protocol/openid-connect/token', {method:'POST',
  body:new URLSearchParams({grant_type:'password',client_id:'admin-cli',
    username:process.env.AUTH_ADMIN_USERNAME,password:process.env.AUTH_ADMIN_PASSWORD})});
const headers={authorization:'Bearer '+login.access_token,'content-type':'application/json'};
const db=createDatabaseClient({connectionString:process.env.DATABASE_URL,maxConnections:2});
try {
  for (const username of ['admin','user']) {
    const role=username==='admin'?'ROOT':'USER';
    await api('/admin/realms/FORMIQ/partialImport',{method:'POST',headers,body:JSON.stringify({
      ifResourceExists:'SKIP',users:[{username,email:username+'@formiq.test',enabled:true,
      emailVerified:true,firstName:username,lastName:'PoC',realmRoles:[role],
      credentials:[{type:'password',value:username,temporary:false}]}]})});
    const [account]=await api('/admin/realms/FORMIQ/users?exact=true&username='+username,{headers});
    if (!account?.enabled || account.email!==username+'@formiq.test') throw new Error('PoC user conflict');
    const roles=await api('/admin/realms/FORMIQ/users/'+account.id+'/role-mappings/realm/composite',{headers});
    if(!roles.some(r=>r.name===role)) throw new Error('PoC user role mismatch');
    // Bind only the verified PoC subject. Global email-based account linking stays disabled.
    await db.$transaction(async tx => {
      const user=await tx.user.upsert({where:{keycloakUuid:account.id},create:{keycloakUuid:account.id},update:{}});
      const identity=await tx.account.upsert({
        where:{provider_subject:{provider:'keycloak',subject:account.id}},
        create:{provider:'keycloak',subject:account.id,userUuid:user.uuid},update:{},
      });
      if(identity.userUuid!==user.uuid) throw new Error('PoC provider identity conflict');
    });
  }
  console.log('[poc] Database and Keycloak identities ready: admin and user.');
} finally {await db.$disconnect();}
