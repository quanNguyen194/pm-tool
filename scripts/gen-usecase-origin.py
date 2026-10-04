#!/usr/bin/env python3
"""Sinh SQL gắn NGUỒN GỐC cho use case từ các sheet lịch sử thay đổi phạm vi của file Excel.

Dùng (chạy SAU khi đã nhập use case bằng gen-usecase-import.py và đã chạy migration 0011):
    python scripts/gen-usecase-origin.py "<file.xlsx>" [--project MA_DU_AN] [--out supabase/imports]

Đọc 3 sheet:
    "Danh sách UC bổ sung"         -> use case đã có trong danh sách final được đánh dấu origin = added (+ lý do, thời điểm thống nhất)
    "Danh sách UC điều chỉnh"      -> origin = adjusted (+ số liệu hợp đồng -> sau điều chỉnh, giải trình)
    "Danh sách UC không thực hiện" -> THÊM MỚI các use case (mã KTH-001...) với trạng thái "Không thực hiện",
                                      đặt vào đúng module/nhóm nếu tìm được, không thì vào module "Không thực hiện (phân hệ)".
Khớp use case theo (phân hệ, tên) và thứ tự xuất hiện (tên trùng giữa các module được ghép lần lượt).
Không khớp được dòng nào thì dừng và liệt kê để xử lý tay.

Sinh ra:
    qtvt_usecases_origin.sql            chạy lại nhiều lần không tạo trùng; không ghi đè trạng thái đã đổi tay
    qtvt_usecases_origin_rollback.sql   gỡ các use case "không thực hiện" đã thêm và trả nguồn gốc về mặc định
"""
import argparse
import difflib
import importlib.util
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import openpyxl

_spec = importlib.util.spec_from_file_location('gen_import', Path(__file__).with_name('gen-usecase-import.py'))
gi = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gi)

SECTIONS = {'A.1.1': 'Web', 'A.1.2': 'Mobile', 'A.1.3': 'Tích hợp dữ liệu', 'A.1.4': 'Tích hợp dữ liệu', 'A.2': 'Văn phòng', 'B': 'Kho dữ liệu'}
PREFIX = {'Web': 'W', 'Mobile': 'M', 'Tích hợp dữ liệu': 'TH', 'Văn phòng': 'VP', 'Kho dữ liệu': 'KDL'}
ROMAN = re.compile(r'^[IVXL]+$')
ROMAN_SUB = re.compile(r'^[IVXL]+\.\d+$')


def norm(text):
    return re.sub(r'\s+', ' ', str(text).lower()).strip()


def parse_flat(path, sheet, cols):
    """Đọc sheet phụ: mỗi dòng use case kèm phân hệ + tên module/nhóm đang đứng.
    Các sheet này đánh số/đặt tiêu đề không đồng nhất nên không dựng cây, chỉ ghi nhận ngữ cảnh."""
    ws = openpyxl.load_workbook(path, data_only=True)[sheet]
    out, section, module, group, started = [], None, None, None, False
    for row_no, r in enumerate(ws.iter_rows(min_row=1, max_col=max(cols.values()) + 1, values_only=True), 1):
        stt, title = gi.clean(r[0]), gi.clean(r[1])
        if stt == 'STT':
            started = True
            continue
        if not started or not stt:
            continue
        if re.fullmatch(r'\d+', stt):
            if not title:
                continue
            d = {'title': title, 'section': section, 'module': module, 'group': group, 'row': row_no}
            for key, ix in cols.items():
                d[key] = gi.clean(r[ix])
            d['actor'] = gi.clean_actor(r[cols['actor']])
            d['flow'] = gi.parse_flow(r[cols['flow']]) if 'flow' in cols else []
            out.append(d)
        elif stt in SECTIONS:
            section, module, group = SECTIONS[stt], None, None
        elif 'Kho dữ liệu' in title and stt not in ('A', 'B', 'A.1'):
            section, module, group = 'Kho dữ liệu', title, None
        elif ROMAN.match(stt):
            module, group = title, None
        elif ROMAN_SUB.match(stt):
            group = title
    return out


def to_int(value):
    return int(float(value)) if value not in ('', None) else None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('xlsx')
    ap.add_argument('--project', default='GPDN_DNMB_EVNNPC_QTVT_251004')
    ap.add_argument('--out', default='supabase/imports')
    args = ap.parse_args()

    final, _ = gi.parse(args.xlsx, 'UC sau điều chỉnh final')
    final_ucs = [n for n in final if n['kind'] == 'usecase']
    final_groups = [n for n in final if n['kind'] == 'group']

    # ---- đọc 3 sheet ----
    common = {'actor': 2, 'tx': 6, 'cx': 7, 'reason': 8, 'when': 9}
    added = parse_flat(args.xlsx, 'Danh sách UC bổ sung', common)
    adjusted = parse_flat(args.xlsx, 'Danh sách UC điều chỉnh', {'actor': 2, 'c_tx': 5, 'c_cx': 6, 'tx': 8, 'cx': 9, 'reason': 10})
    dropped = parse_flat(args.xlsx, 'Danh sách UC không thực hiện', {**common, 'flow': 4})
    print(f'Đọc được: bổ sung {len(added)}, điều chỉnh {len(adjusted)}, không thực hiện {len(dropped)}')

    # ---- khớp với danh sách final theo (phân hệ, tên) + thứ tự ----
    by_key = defaultdict(list)
    for n in final_ucs:
        by_key[(n['tags'][0], norm(n['title']))].append(n)
    def match(items, label):
        used = Counter()
        taken = set()
        pairs, missing = [], []
        for it in items:
            key = (it['section'], norm(it['title']))
            i = used[key]
            used[key] += 1
            cands = by_key.get(key, [])
            if i < len(cands) and cands[i]['code'] not in taken:
                pairs.append((it, cands[i]))
                taken.add(cands[i]['code'])
                continue
            # Tên đã được đổi nhẹ trong danh sách final: chấp nhận nếu rất giống và duy nhất.
            pool = {norm(n['title']): n for n in final_ucs if n['tags'][0] == it['section'] and n['code'] not in taken}
            close = difflib.get_close_matches(norm(it['title']), list(pool), n=2, cutoff=0.8)
            if len(close) == 1:
                cand = pool[close[0]]
                ratio = difflib.SequenceMatcher(None, norm(it['title']), close[0]).ratio()
                print(f'  ~ {label}: "{it["title"]}" khớp gần đúng "{cand["title"]}" ({ratio:.2f})')
                pairs.append((it, cand))
                taken.add(cand['code'])
            else:
                missing.append(it)
        return pairs, missing

    p_added, miss_added = match(added, 'bổ sung')
    p_adj, miss_adj = match(adjusted, 'điều chỉnh')
    problems = [('bổ sung', miss_added), ('điều chỉnh', miss_adj)]
    for label, miss in problems:
        for m in miss:
            print(f'KHÔNG KHỚP ({label}): [{m["section"]}] {m["title"]}', file=sys.stderr)
    if miss_added or miss_adj:
        sys.exit('Có dòng không khớp được với danh sách final - dừng.')
    overlap = {f['code'] for _, f in p_added} & {f['code'] for _, f in p_adj}
    if overlap:
        sys.exit(f'LỖI: use case vừa bổ sung vừa điều chỉnh: {sorted(overlap)}')

    # ---- đánh dấu nguồn gốc ----
    cx_label = {'simple': 'Đơn giản', 'medium': 'Trung bình', 'complex': 'Phức tạp'}
    marks = []
    for it, f in p_added:
        marks.append({'code': f['code'], 'origin': 'added', 'note': it['reason'], 'agreed': it['when']})
    for it, f in p_adj:
        before = f"Theo hợp đồng: {it['c_tx']} transaction ({cx_label.get(gi.COMPLEXITY.get(it['c_cx'].lower()), it['c_cx'])})"
        after = f"sau điều chỉnh: {it['tx']} transaction ({cx_label.get(gi.COMPLEXITY.get(it['cx'].lower()), it['cx'])})"
        marks.append({'code': f['code'], 'origin': 'adjusted', 'note': f"{before} → {after}. {it['reason']}".strip(), 'agreed': ''})

    # ---- use case "không thực hiện": đặt vào module/nhóm tương ứng ----
    groups_by_key = defaultdict(list)
    for g in final_groups:
        groups_by_key[(g['tags'][0], norm(g['title']))].append(g['code'])

    def resolve(section, module, group):
        for title in (group, module):
            if title and groups_by_key.get((section, norm(title))):
                return groups_by_key[(section, norm(title))][0]
        return None

    fallback = {}
    cancelled, nodes = [], []
    for it in dropped:
        if not it['section']:
            sys.exit(f'LỖI: dòng {it["row"]} (không thực hiện) không thuộc phân hệ nào')
        parent = resolve(it['section'], it['module'], it['group'])
        if parent is None and it['section'] == 'Tích hợp dữ liệu':
            parent = groups_by_key.get(('Tích hợp dữ liệu', norm('Lấy dữ liệu từ Kho')), [None])[0]
        if parent is None:
            code = f'KTH-{PREFIX[it["section"]]}'
            if code not in fallback:
                fallback[code] = {'code': code, 'parent': None, 'kind': 'group', 'title': f'Không thực hiện ({it["section"]})',
                                  'tags': [it['section']]}
            parent = code
        cx = gi.COMPLEXITY.get(it['cx'].lower())
        cancelled.append({
            'code': f'KTH-{len(cancelled) + 1:03d}', 'parent': parent, 'kind': 'usecase', 'title': it['title'],
            'actor': it['actor'], 'flow': it['flow'], 'tags': [it['section']], 'complexity': cx,
            'transactions': to_int(it['tx']), 'necessity': 'B', 'note': it['reason'], 'agreed': it['when'],
        })
    nodes = list(fallback.values()) + cancelled

    # ---- thống kê ----
    print(f'Bổ sung: {len(p_added)} | Điều chỉnh: {len(p_adj)} | Không thực hiện: {len(cancelled)} (module dự phòng: {len(fallback)})')
    for c in cancelled:
        where = 'dự phòng' if c['parent'].startswith('KTH-') else c['parent']
        print(f'  {c["code"]} [{c["tags"][0]}] -> {where}: {c["title"][:60]}')

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / 'qtvt_usecases_origin.sql').write_text(build_sql(args, marks, nodes), encoding='utf-8')
    (out / 'qtvt_usecases_origin_rollback.sql').write_text(build_rollback(args, marks, nodes), encoding='utf-8')
    print('Đã ghi', out / 'qtvt_usecases_origin.sql', 'và', out / 'qtvt_usecases_origin_rollback.sql')


def js(data):
    text = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    if '$json$' in text:
        sys.exit('LỖI: dữ liệu chứa chuỗi $json$')
    return text.replace('},{', '},\n{')


def sql_str(value):
    return "'" + value.replace("'", "''") + "'"


def build_sql(args, marks, nodes):
    n_added = sum(1 for m in marks if m['origin'] == 'added')
    n_adj = len(marks) - n_added
    n_uc = sum(1 for n in nodes if n['kind'] == 'usecase')
    payload = [{'sort': i, 'code': n['code'], 'parent': n['parent'], 'kind': n['kind'], 'title': n['title'],
                'actor': n.get('actor', ''), 'flow': n.get('flow', []), 'tags': n['tags'], 'complexity': n.get('complexity'),
                'transactions': n.get('transactions'), 'necessity': n.get('necessity', 'B'),
                'note': n.get('note', ''), 'agreed': n.get('agreed', '')} for i, n in enumerate(nodes, 1)]
    return f"""-- Gắn nguồn gốc use case dự án {args.project} (theo các sheet bổ sung / điều chỉnh / không thực hiện).
-- Gồm: {n_added} use case bổ sung, {n_adj} use case điều chỉnh, {n_uc} use case "Không thực hiện" (thêm mới, mã KTH-xxx).
-- Sinh tự động bởi scripts/gen-usecase-origin.py - đừng sửa tay, hãy sửa Excel rồi sinh lại.
--
-- Chạy SAU migration 0011_usecase_origin.sql và SAU qtvt_usecases_import.sql, trong Supabase SQL Editor.
-- An toàn khi chạy lại. Không đổi trạng thái/tiến độ của các use case đã có.
-- Hoàn tác: chạy qtvt_usecases_origin_rollback.sql.

do $origin$
declare
  v_project_code constant text := '{args.project}';
  v_project uuid;
  r record;
  v_parent uuid;
  n_marked integer := 0;
  n_new integer := 0;
  n_upd integer := 0;
  v_new boolean;
begin
  select id into v_project from public.projects where code = v_project_code;
  if v_project is null then
    raise exception 'Không tìm thấy dự án có mã %. Kiểm tra lại mã dự án.', v_project_code;
  end if;

  -- 1. Đánh dấu nguồn gốc cho use case đã có trong danh sách final
  for r in
    select * from jsonb_to_recordset($json${js(marks)}
$json$::jsonb) as x(code text, origin text, note text, agreed text)
  loop
    update public.use_cases
       set origin = r.origin, change_note = r.note, agreed_when = r.agreed
     where project_id = v_project and code = r.code;
    if not found then
      raise exception 'Không tìm thấy use case % - hãy chạy qtvt_usecases_import.sql trước.', r.code;
    end if;
    n_marked := n_marked + 1;
  end loop;

  -- 2. Thêm các use case "Không thực hiện" (giữ để truy vết, không tính vào số lượng/UCP/tiến độ)
  for r in
    select * from jsonb_to_recordset($json${js(payload)}
$json$::jsonb) as x(sort integer, code text, parent text, kind text, title text, actor text, flow jsonb, tags jsonb,
                    complexity text, transactions integer, necessity text, note text, agreed text)
     order by sort
  loop
    v_parent := null;
    if r.parent is not null then
      select id into v_parent from public.use_cases where project_id = v_project and code = r.parent;
      if v_parent is null then
        raise exception 'Không tìm thấy use case cha % của % - hãy chạy qtvt_usecases_import.sql trước.', r.parent, r.code;
      end if;
    end if;

    insert into public.use_cases
      (project_id, parent_id, code, title, actor, main_flow, kind, tags, complexity, transactions, necessity,
       status, origin, change_note, agreed_when)
    values
      (v_project, v_parent, r.code, r.title, coalesce(r.actor, ''), array(select jsonb_array_elements_text(r.flow)),
       r.kind, array(select jsonb_array_elements_text(r.tags)), r.complexity, r.transactions, coalesce(r.necessity, 'B'),
       case when r.kind = 'usecase' then 'cancelled' else 'draft' end, 'contract', r.note, r.agreed)
    on conflict (project_id, code) do update
      set parent_id = excluded.parent_id, title = excluded.title, actor = excluded.actor, main_flow = excluded.main_flow,
          tags = excluded.tags, complexity = excluded.complexity, transactions = excluded.transactions,
          necessity = excluded.necessity, change_note = excluded.change_note, agreed_when = excluded.agreed_when
    returning (xmax = 0) into v_new;

    if v_new then n_new := n_new + 1; else n_upd := n_upd + 1; end if;
  end loop;

  raise notice 'Xong: % use case được đánh dấu nguồn gốc, % use case không thực hiện thêm mới, % cập nhật.', n_marked, n_new, n_upd;
end
$origin$;

-- Kiểm tra nhanh: kỳ vọng added = {n_added}, adjusted = {n_adj}, contract = (còn lại), và {n_uc} use case "cancelled".
select origin, status = 'cancelled' as khong_thuc_hien, count(*) as so_luong
  from public.use_cases
 where project_id = (select id from public.projects where code = '{args.project}') and kind = 'usecase'
 group by 1, 2
 order by 1, 2;
"""


def build_rollback(args, marks, nodes):
    codes = ', '.join(sql_str(m['code']) for m in marks)
    kth = ', '.join(sql_str(n['code']) for n in nodes)
    return f"""-- Hoàn tác lần gắn nguồn gốc dự án {args.project}.
-- Xóa các use case "Không thực hiện" (KTH-xxx) và module dự phòng đã thêm, trả nguồn gốc các use case khác về "theo hợp đồng".

delete from public.use_cases
 where project_id = (select id from public.projects where code = '{args.project}')
   and code in ({kth});

update public.use_cases
   set origin = 'contract', change_note = '', agreed_when = ''
 where project_id = (select id from public.projects where code = '{args.project}')
   and code in ({codes});
"""


if __name__ == '__main__':
    main()
