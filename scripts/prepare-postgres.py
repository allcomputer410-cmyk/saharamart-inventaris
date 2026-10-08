"""Extract application data from a pg_dumpall backup; never execute source SQL here.

Usage: python scripts/prepare-postgres.py PATH_TO_BACKUP
Output is private, git-ignored, and intended for a NEW, EMPTY local database.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def prepare(source: Path):
    if source.is_dir():
        files = list(source.glob('*.backup'))
        if len(files) != 1:
            raise ValueError('Pilih satu file backup di dalam folder.')
        source = files[0]
    raw = source.read_bytes()
    if raw.startswith(b'PGDMP'):
        raise ValueError('Script ini memerlukan backup SQL teks, bukan format custom.')
    sql = raw.decode('utf-8')
    if 'PostgreSQL database cluster dump complete' not in sql and 'PostgreSQL database dump complete' not in sql:
        raise ValueError('Backup tidak memiliki penanda selesai.')
    blocks = re.split(r'(?m)^--\n-- (?:Data for )?Name: ', sql)
    allowed = {'TABLE', 'TABLE DATA', 'FUNCTION', 'VIEW', 'SEQUENCE', 'SEQUENCE SET',
               'SEQUENCE OWNED BY', 'DEFAULT', 'CONSTRAINT', 'FK CONSTRAINT', 'INDEX', 'TRIGGER', 'TYPE'}
    output = ['\\set ON_ERROR_STOP on\nBEGIN;\nSET check_function_bodies = false;\nSET search_path = public, extensions;\n']
    counts = {}
    kept = []
    for block in blocks[1:]:
        header, body = block.split('\n', 1)
        m = re.match(r'(.*); Type: (.*); Schema: (.*); Owner:', header)
        if not m:
            continue
        name, kind, schema = m.groups()
        if kind not in allowed:
            continue
        # Preserve the original auth.users IDs and password hashes, never old sessions/tokens.
        is_users = schema == 'auth' and (name == 'users' or name == 'users users_pkey')
        if schema != 'public' and not is_users:
            continue
        if is_users and kind not in {'TABLE', 'TABLE DATA', 'CONSTRAINT'}:
            continue
        body = re.sub(r'(?m)^ALTER [^\n]+ OWNER TO [^\n]+;\n?', '', body)
        # No cluster-level psql commands may enter this single-database extraction.
        if kind != 'TABLE DATA' and re.search(r'(?m)^\\', body):
            raise ValueError(f'Unexpected psql command in {name}')
        if kind == 'TABLE DATA':
            match = re.search(r'(?m)^COPY ([\w.]+) .* FROM stdin;\n(.*?)^\\\.', body, re.S | re.M)
            if not match:
                raise ValueError(f'COPY section incomplete: {name}')
            counts[match[1]] = len(match[2].splitlines()) if match[2] else 0
        kept.append({'schema': schema, 'name': name, 'kind': kind})
        output.append('-- Name: ' + header + '\n' + body)
    if not counts.get('public.stores') or not counts.get('auth.users'):
        raise ValueError('Data toko atau akun tidak ditemukan.')
    output.append('\nCOMMIT;\n')
    destination = ROOT / 'backend' / 'private'
    destination.mkdir(parents=True, exist_ok=True)
    (destination / 'restore.sql').write_text(''.join(output), encoding='utf-8')
    report = {'source_bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
              'row_counts': counts, 'objects': kept}
    (destination / 'manifest.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(f'Prepared {len(kept)} objects, {sum(counts.values()):,} rows in backend/private/restore.sql')
    print('Backup asli tidak diubah. File hasil mengandung data pribadi; jangan diunggah ke Git.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('backup', type=Path)
    prepare(parser.parse_args().backup)
