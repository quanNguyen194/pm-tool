// Kiểm tra migration 0018: người đã đăng nhập nhưng KHÔNG thuộc dự án không vượt được kiểm tra quyền của các hàm RPC
// (lỗi cũ: hàm can_* trả NULL nên "if not can_...(...)" không bao giờ báo lỗi cho người ngoài dự án).
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const MIG = new URL('../migrations/', import.meta.url);
const FILES = ['0001_schema.sql', '0002_quality_template.sql', '0003_rpc_and_seed.sql', '0004_criteria_insert_guard.sql', '0005_deadlines_and_snapshots.sql', '0007_report_schedules.sql', '0008_roles_usecase_tree_task_fields.sql', '0009_usecase_attributes.sql', '0010_usecase_stages.sql', '0011_usecase_origin.sql', '0012_task_use_cases.sql', '0013_placeholder_accounts.sql'];

async function boot(extra) {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create publication supabase_realtime;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated, public;
  `);
  for (const f of [...FILES, ...extra]) await db.exec(fs.readFileSync(new URL(f, MIG), 'utf8'));
  return db;
}

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (cond ? '' : '  ' + extra)); };

async function scenario(label, extra, expectBlocked) {
  const db = await boot(extra);
  const q = async (s, p) => (await db.query(s, p)).rows;
  const ids = {};
  for (const n of ['admin', 'pm', 'dev', 'outsider']) {
    ids[n] = (await q(`insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id`, [`${n}@t.vn`, JSON.stringify({ name: n })]))[0].id;
  }
  const P = (await q(`insert into projects (code,name,start_date,target_end_date,manager_id) values ('P','P',current_date,current_date+30,$1) returning id`, [ids.pm]))[0].id;
  await q(`insert into project_members (project_id,user_id,role) values ($1,$2,'dev')`, [P, ids.dev]);
  const T = (await q(`insert into tasks (project_id,code,title,start_date,due_date,assignee_id) values ($1,'T','t',current_date,current_date,$2) returning id`, [P, ids.dev]))[0].id;
  const UC = (await q(`insert into use_cases (project_id, code, title) values ($1,'UC-1','u') returning id`, [P]))[0].id;
  const QI = (await q(`select id from quality_items where project_id=$1 limit 1`, [P]))[0].id;
  const as = async who => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${ids[who]}', false); set role authenticated;`);
  };

  const probes = [
    ['add_project_member', `select add_project_member($1,'outsider@t.vn','pm')`, [P]],
    ['add_project_member_by_id', `select add_project_member_by_id($1,$2,'pm')`, [P, ids.outsider]],
    ['suggest_accounts', `select * from suggest_accounts($1,'')`, [P]],
    ['send_task_reminder', `select send_task_reminder($1)`, [T]],
    ['generate_report_now', `select generate_report_now($1,'weekly')`, [P]],
    ['set_quality_item', `select set_quality_item($1,true,null,null)`, [QI]],
    ['set_use_case_stages', `select set_use_case_stages(array[$1]::uuid[],'analysis',true,null)`, [UC]]
  ];
  for (const [name, sql, p] of probes) {
    await as('outsider');
    let allowed = true;
    try { await db.query(sql, p); } catch { allowed = false; }
    ok(expectBlocked ? `${label}: người ngoài dự án bị chặn ở ${name}` : `${label}: (xác nhận lỗ hổng cũ) người ngoài lọt qua ${name}`, allowed === !expectBlocked, allowed ? 'ĐƯỢC PHÉP (lỗ hổng)' : 'bị chặn');
  }
  await db.exec('reset role');
  const rows = await q(`select count(*)::int c from project_members where user_id = $1`, [ids.outsider]);
  ok(expectBlocked ? `${label}: người ngoài không tự thêm mình vào dự án` : `${label}: (xác nhận lỗ hổng cũ) người ngoài tự thêm mình làm PM`, expectBlocked ? rows[0].c === 0 : rows[0].c > 0, `c=${rows[0].c}`);
  // Người trong dự án vẫn dùng bình thường
  await as('pm');
  let pmOk = true;
  try { await db.query(`select add_project_member($1,'outsider@t.vn','viewer')`, [P]); await db.query(`select send_task_reminder($1)`, [T]); } catch (e) { pmOk = false; }
  ok(`${label}: PM của dự án vẫn thêm thành viên và nhắc việc được`, pmOk);
  await as('dev');
  let devBlocked = false;
  try { await db.query(`select add_project_member($1,'outsider@t.vn','pm')`, [P]); } catch { devBlocked = true; }
  ok(`${label}: dev không phải PM vẫn bị chặn`, devBlocked);
  await db.exec('reset role');
  await db.close?.();
}

// Trước bản sửa: các probe đều lọt qua (xác nhận test thật sự phát hiện được lỗi).
await scenario('TRƯỚC 0018', [], false);
// Sau bản sửa: tất cả bị chặn.
await scenario('SAU 0018', ['0018_fix_null_permission_checks.sql'], true);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
