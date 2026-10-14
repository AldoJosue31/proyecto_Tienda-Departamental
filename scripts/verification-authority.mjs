import { randomUUID } from "node:crypto";
export function localCrmAuthority(load,env) {
  process.env.AUTH_SERVICE_URL="http://127.0.0.1:3301";
  process.env.ORDERS_SERVICE_URL="http://127.0.0.1:3305";
  process.env.CRM_IDENTITY_DIRECTORY_KEY=env.CRM_IDENTITY_DIRECTORY_KEY;
  process.env.CRM_ORDERS_REPORT_KEY=env.CRM_ORDERS_REPORT_KEY;
  const {CrmAuthorityService}=load("crm","crm/crm-authority.service");return new CrmAuthorityService();
}
// Callers verify the fixed integration container labels before constructing pools.
export async function seedInactiveCustomer(auth,orders,id,branchId,creator,{purchased=true}={}) {
  await auth.query("INSERT INTO auth_users(id,email,name,password_hash,role,is_active,onboarding_status,email_verified_at,verification_source,created_at) SELECT $1,$2,'Cliente universitario de regresión',password_hash,'CUSTOMER',TRUE,'READY',NOW(),'TEST_FIXTURE','2025-01-01'::timestamptz FROM auth_users WHERE email='customer@departamental.local'",[id,`regression-${id.slice(0,12)}@example.test`]);
  if(purchased) await orders.query("INSERT INTO orders(id,customer_id,created_by,created_by_role,branch_id,status,subtotal,total,created_at) VALUES ($1,$2,$3,'ADMIN',$4,'CONFIRMED',100,100,'2025-01-01'::timestamptz)",[randomUUID(),id,creator,branchId]);
}
