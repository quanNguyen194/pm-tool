#!/usr/bin/env python3
"""Sinh SQL nhập danh sách Use Case từ sheet "UC sau điều chỉnh final" của file Excel danh sách chức năng.

Dùng:
    python scripts/gen-usecase-import.py "<file.xlsx>" [--project MA_DU_AN] [--sheet "UC sau điều chỉnh final"] [--out supabase/imports]

Sinh ra 2 file trong thư mục --out:
    qtvt_usecases_import.sql     nhập (chạy lại nhiều lần không tạo trùng, không ghi đè trạng thái/tiến độ)
    qtvt_usecases_rollback.sql   xóa các use case do lần nhập này tạo

Quy tắc chuyển cây 6 cấp trong Excel thành cây 3 cấp:
    - Bỏ qua các cấp "Hạng mục" (A, B), "Lĩnh vực" (A.1 VẬT TƯ, III Văn phòng).
    - Cấp "Kênh/phân hệ" (A.1.1 Web, A.1.2 Mobile, A.1.3 Tích hợp dữ liệu, Văn phòng, Kho dữ liệu) thành NHÃN (tags);
      riêng "Tích hợp dữ liệu" là một module (cấp 1) theo yêu cầu.
    - Module (I, II, ...) = cấp 1; nhóm chức năng (I.1, X.2, ...) = cấp 2; Use case = cấp lá (cấp 3 hoặc cấp 2 nếu module không có nhóm).
"""
import argparse
import json
import re
import sys
from pathlib import Path

import openpyxl

ROMAN = re.compile(r'^[IVXL]+$')
ROMAN_SUB = re.compile(r'^[IVXL]+\.\d+$')
COMPLEXITY = {'đơn giản': 'simple', 'trung bình': 'medium', 'phức tạp': 'complex'}

# Phân hệ (nhãn + tiền tố mã) theo dòng tiêu đề trong Excel.
SECTIONS = {
    'A.1.1': ('W', 'Web'),
    'A.1.2': ('M', 'Mobile'),
    'A.1.3': ('TH', 'Tích hợp dữ liệu'),
}


def clean(value):
    """Gộp khoảng trắng/xuống dòng thành một dấu cách."""
    return re.sub(r'\s+', ' ', str(value)).strip() if value is not None else ''


def clean_actor(value):
    """Nhiều tác nhân xuống dòng trong một ô -> nối bằng dấu phẩy."""
    if value is None:
        return ''
    parts = [re.sub(r'\s+', ' ', p).strip() for p in str(value).split('\n')]
    return ', '.join(p for p in parts if p)


def parse_flow(text):
    """Tách "1. ...\n2. ..." thành danh sách bước; dòng không có số được nối vào bước trước."""
    if not text:
        return []
    steps = []
    for raw in str(text).replace('\r', '').split('\n'):
        line = raw.strip()
        if not line:
            continue
        m = re.match(r'^(\d+)\s*[.)]\s*(.*)$', line)
        if m:
            steps.append(m.group(2).strip())
        elif steps:
            steps[-1] += ' ' + line
        else:
            steps.append(line)
    steps = [re.sub(r'\s+', ' ', s) for s in steps if s]
    return [f'{i}. {s}' for i, s in enumerate(steps, 1)]


def parse(path, sheet):
    ws = openpyxl.load_workbook(path, data_only=True)[sheet]
    nodes = []          # theo thứ tự duyệt: cha luôn đứng trước con
    section = None      # (tiền tố, nhãn)
    module = None       # mã module hiện tại
    group = None        # mã nhóm hiện tại
    skipped = []
    started = False     # bỏ qua phần tiêu đề/tổng hợp phía trên dòng tiêu đề cột "STT"

    def add(node):
        node['sort'] = len(nodes) + 1
        nodes.append(node)

    for row_no, r in enumerate(ws.iter_rows(min_row=1, max_col=8, values_only=True), 1):
        stt = clean(r[0])
        title = clean(r[1])
        if stt == 'STT':
            started = True
            continue
        if not started or not stt:
            continue

        if re.fullmatch(r'\d+', stt):  # use case
            parent = group or module
            if not parent or not section:
                skipped.append((row_no, stt, title, 'Use case nằm ngoài module'))
                continue
            tx = clean(r[6])
            cx = COMPLEXITY.get(clean(r[7]).lower())
            if not title:
                skipped.append((row_no, stt, title, 'Thiếu tên use case'))
                continue
            add({
                'code': f'UC-{int(stt):03d}', 'parent': parent, 'kind': 'usecase', 'title': title,
                'actor': clean_actor(r[2]), 'flow': parse_flow(r[4]), 'tags': [section[1]],
                'complexity': cx, 'transactions': int(float(tx)) if tx else None,
                'necessity': clean(r[5]) or 'B', 'src_row': row_no,
            })
            continue

        # ----- các dòng tiêu đề -----
        if stt in ('A', 'B') or stt == 'A.1':
            module = group = None
            if stt == 'B':
                section = ('KDL', 'Kho dữ liệu')
            continue
        if stt in SECTIONS:
            section = SECTIONS[stt]
            module = group = None
            if stt == 'A.1.3':  # "Tích hợp dữ liệu" là một module riêng (cấp 1)
                module = section[0]
                add({'code': module, 'parent': None, 'kind': 'group', 'title': title, 'tags': [section[1]], 'src_row': row_no})
            continue
        if ROMAN.match(stt) and title.lower() == 'văn phòng':  # tiêu đề lĩnh vực, không tạo nút
            section = ('VP', 'Văn phòng')
            module = group = None
            continue
        if ROMAN.match(stt):
            if not section:
                skipped.append((row_no, stt, title, 'Module nằm ngoài phân hệ'))
                continue
            group = None
            if section[0] == 'TH':  # "I Lấy dữ liệu từ Kho" là nhóm (cấp 2) của module Tích hợp dữ liệu
                group = f'TH-{stt}'
                add({'code': group, 'parent': module, 'kind': 'group', 'title': title, 'tags': [section[1]], 'src_row': row_no})
            else:
                module = f'{section[0]}-{stt}'
                add({'code': module, 'parent': None, 'kind': 'group', 'title': title, 'tags': [section[1]], 'src_row': row_no})
            continue
        if ROMAN_SUB.match(stt):
            if not module:
                skipped.append((row_no, stt, title, 'Nhóm nằm ngoài module'))
                continue
            group = f'{section[0]}-{stt}'
            add({'code': group, 'parent': module, 'kind': 'group', 'title': title, 'tags': [section[1]], 'src_row': row_no})
            continue
        skipped.append((row_no, stt, title, 'Không nhận diện được dòng'))
    return nodes, skipped


def validate(nodes):
    codes = [n['code'] for n in nodes]
    dup = {c for c in codes if codes.count(c) > 1}
    if dup:
        sys.exit(f'LỖI: mã trùng {sorted(dup)}')
    by = {n['code']: n for n in nodes}
    depth = {}
    for n in nodes:
        d = 1
        p = n['parent']
        while p:
            d += 1
            p = by[p]['parent']
        depth[n['code']] = d
        if d > 3:
            sys.exit(f'LỖI: {n["code"]} sâu {d} cấp (tối đa 3)')
    empty_groups = [n['code'] for n in nodes if n['kind'] == 'group' and not any(c['parent'] == n['code'] for c in nodes)]
    if empty_groups:
        print('CẢNH BÁO: nhóm không có con:', empty_groups, file=sys.stderr)
    return depth


def sql_json(nodes):
    payload = []
    for n in nodes:
        payload.append({
            'sort': n['sort'], 'code': n['code'], 'parent': n['parent'], 'kind': n['kind'], 'title': n['title'],
            'actor': n.get('actor', ''), 'flow': n.get('flow', []), 'tags': n['tags'],
            'complexity': n.get('complexity'), 'transactions': n.get('transactions'), 'necessity': n.get('necessity', 'B'),
        })
    text = json.dumps(payload, ensure_ascii=False, separators=(',', ':'), indent=None)
    if '$json$' in text:
        sys.exit('LỖI: dữ liệu chứa chuỗi $json$')
    # Mỗi phần tử một dòng để dễ đọc/diff.
    return text.replace('},{"sort"', '},\n{"sort"')


def build_import_sql(nodes, project, source, label=None):
    ucs = sum(1 for n in nodes if n['kind'] == 'usecase')
    groups = len(nodes) - ucs
    suffix = f' - phần {label}' if label else ''
    return f"""-- Nhập danh sách Use Case dự án {project}{suffix}
-- Nguồn: {source} (sheet UC sau điều chỉnh final)
-- Gồm {groups} module/nhóm (kind = group) và {ucs} use case (kind = usecase), cây tối đa 3 cấp.
-- Sinh tự động bởi scripts/gen-usecase-import.py - đừng sửa tay, hãy sửa Excel rồi sinh lại.
--
-- Chạy SAU migration 0009_usecase_attributes.sql, trong Supabase SQL Editor.
-- An toàn khi chạy lại: khớp theo (dự án, mã); chỉ cập nhật tên/tác nhân/luồng/nhãn/độ phức tạp/transaction,
-- KHÔNG ghi đè trạng thái, tiến độ, người phụ trách, mô tả hay tiêu chí nghiệm thu đã nhập tay.
-- Hoàn tác: chạy qtvt_usecases_rollback.sql.

do $import$
declare
  v_project_code constant text := '{project}';
  v_project uuid;
  r record;
  v_parent uuid;
  v_new boolean;
  n_new integer := 0;
  n_upd integer := 0;
begin
  select id into v_project from public.projects where code = v_project_code;
  if v_project is null then
    raise exception 'Không tìm thấy dự án có mã %. Kiểm tra lại mã dự án.', v_project_code;
  end if;

  for r in
    select *
      from jsonb_to_recordset($json${sql_json(nodes)}
$json$::jsonb)
        as x(sort integer, code text, parent text, kind text, title text, actor text, flow jsonb, tags jsonb,
             complexity text, transactions integer, necessity text)
     order by sort
  loop
    v_parent := null;
    if r.parent is not null then
      select id into v_parent from public.use_cases where project_id = v_project and code = r.parent;
      if v_parent is null then
        raise exception 'Không tìm thấy use case cha % của %', r.parent, r.code;
      end if;
    end if;

    insert into public.use_cases
      (project_id, parent_id, code, title, actor, main_flow, kind, tags, complexity, transactions, necessity)
    values
      (v_project, v_parent, r.code, r.title, coalesce(r.actor, ''),
       array(select jsonb_array_elements_text(r.flow)),
       r.kind, array(select jsonb_array_elements_text(r.tags)), r.complexity, r.transactions, coalesce(r.necessity, 'B'))
    on conflict (project_id, code) do update
      set parent_id = excluded.parent_id,
          title = excluded.title,
          actor = excluded.actor,
          main_flow = excluded.main_flow,
          kind = excluded.kind,
          tags = excluded.tags,
          complexity = excluded.complexity,
          transactions = excluded.transactions,
          necessity = excluded.necessity
    returning (xmax = 0) into v_new;

    if v_new then n_new := n_new + 1; else n_upd := n_upd + 1; end if;
  end loop;

  raise notice 'Nhập xong: % use case/nhóm mới, % cập nhật.', n_new, n_upd;
end
$import$;

-- Kiểm tra nhanh: kỳ vọng {groups} nhóm và {ucs} use case.
select kind, count(*) as so_luong
  from public.use_cases
 where project_id = (select id from public.projects where code = '{project}')
   and code in ({', '.join(repr_sql(n['code']) for n in nodes)})
 group by kind
 order by kind;
"""


def repr_sql(value):
    return "'" + value.replace("'", "''") + "'"


def build_rollback_sql(nodes, project):
    roots = [n['code'] for n in nodes if n['parent'] is None and n['kind'] == 'group']
    ucs_root = [n['code'] for n in nodes if n['parent'] is None and n['kind'] == 'usecase']
    codes = ', '.join(repr_sql(c) for c in roots + ucs_root)
    return f"""-- Hoàn tác lần nhập use case dự án {project}.
-- Xóa các module gốc do lần nhập tạo; các nhóm và use case bên dưới bị xóa theo (ON DELETE CASCADE).
-- Nhiệm vụ đã gắn vào các use case này sẽ mất liên kết use case (use_case_id = null) nhưng không bị xóa.
-- LƯU Ý: use case do bạn tự tạo thêm bên trong các module này cũng sẽ bị xóa theo.

delete from public.use_cases
 where project_id = (select id from public.projects where code = '{project}')
   and parent_id is null
   and code in ({codes});
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('xlsx')
    ap.add_argument('--project', default='GPDN_DNMB_EVNNPC_QTVT_251004')
    ap.add_argument('--sheet', default='UC sau điều chỉnh final')
    ap.add_argument('--out', default='supabase/imports')
    args = ap.parse_args()

    nodes, skipped = parse(args.xlsx, args.sheet)
    depth = validate(nodes)

    ucs = [n for n in nodes if n['kind'] == 'usecase']
    print(f'Nút: {len(nodes)} (nhóm {len(nodes) - len(ucs)}, use case {len(ucs)}). Cấp sâu nhất: {max(depth.values())}')
    for tag in dict.fromkeys(t for n in ucs for t in n['tags']):
        print(f'  {tag}: {sum(1 for n in ucs if tag in n["tags"])} UC')
    for s in skipped:
        print('BỎ QUA:', s, file=sys.stderr)
    if skipped:
        sys.exit('Có dòng bị bỏ qua - dừng, hãy kiểm tra lại file.')

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / 'qtvt_usecases_import.sql').write_text(build_import_sql(nodes, args.project, Path(args.xlsx).name), encoding='utf-8')
    (out / 'qtvt_usecases_rollback.sql').write_text(build_rollback_sql(nodes, args.project), encoding='utf-8')

    # Bản chia nhỏ theo phân hệ (dự phòng nếu SQL Editor không nhận nổi file dài). Mỗi phần tự đủ module cha.
    parts = out / 'parts'
    parts.mkdir(exist_ok=True)
    for old in parts.glob('*.sql'):
        old.unlink()
    slugs = {'Web': 'web', 'Mobile': 'mobile', 'Tích hợp dữ liệu': 'tich_hop_du_lieu', 'Văn phòng': 'van_phong', 'Kho dữ liệu': 'kho_du_lieu'}
    for i, tag in enumerate(dict.fromkeys(n['tags'][0] for n in nodes), 1):
        part = [n for n in nodes if n['tags'][0] == tag]
        name = f'{i:02d}_{slugs.get(tag, "phan_he")}.sql'
        (parts / name).write_text(build_import_sql(part, args.project, Path(args.xlsx).name, label=tag), encoding='utf-8')
    print('Đã ghi', out / 'qtvt_usecases_import.sql', 'và', out / 'qtvt_usecases_rollback.sql')


if __name__ == '__main__':
    main()
