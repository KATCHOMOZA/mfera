import json
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

with open('malawi_customs_excise_tariffs_2025-2027.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

schedule = data['schedules']['first_schedule_customs_tariffs']
records = []
for item in schedule.get('items', []):
    if item.get('type') != 'item':
        continue
    rates = item.get('rates') or {}
    records.append({
        'subheading': item.get('hs_code'),
        'description': item.get('description'),
        'heading': item.get('heading_code'),
        'chapter': item.get('chapter'),
        'dutyGeneral': rates.get('general_rate'),
        'dutyPreferential': rates.get('column6_rate'),
        'comesa': rates.get('comesa_rate'),
        'afcfta': rates.get('afcfta_rate'),
        'sadcOther': rates.get('sadc_rate'),
        'sadcSa': rates.get('sadc_rsa_rate'),
        'excise': rates.get('excise_rate'),
        'vat': rates.get('vat_rate'),
        'ait': rates.get('ait_rate'),
    })


def display_excise(record):
    excise = (record.get('excise') or '').strip()
    return '—' if excise == '17.5%' else excise


def display_vat(record):
    vat = (record.get('vat') or '').strip()
    return 'Exempt' if vat == '10%' else vat


def display_ait(record):
    ait = (record.get('ait') or '').strip()
    return '10%' if ait in {'-', '', None} else ait


def style_header(ws):
    header_fill = PatternFill('solid', fgColor='D9EAD3')
    header_font = Font(bold=True)
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal='center')


def write_rows(ws, headers, rows):
    ws.append(headers)
    style_header(ws)
    for row in rows:
        ws.append(row)
    for col in range(1, len(headers) + 1):
        ws.column_dimensions[get_column_letter(col)].width = 18
    ws.freeze_panes = 'A2'


wb = Workbook()
ws = wb.active
ws.title = 'Tariff Lookup'

full_headers = [
    'Subheading',
    'Description',
    'Heading',
    'Heading Description',
    'Chapter',
    'General Duty',
    'Preferential',
    'COMESA',
    'AfCFTA',
    'SADC (other)',
    'SADC (SA)',
    'Excise',
    'VAT',
    'AIT',
]
full_rows = []
for record in records:
    full_rows.append([
        record.get('subheading', ''),
        record.get('description', ''),
        record.get('heading', ''),
        record.get('headingDesc', ''),
        record.get('chapter', ''),
        record.get('dutyGeneral', ''),
        record.get('dutyPreferential', ''),
        record.get('comesa', ''),
        record.get('afcfta', ''),
        record.get('sadcOther', ''),
        record.get('sadcSa', ''),
        display_excise(record),
        display_vat(record),
        display_ait(record),
    ])
write_rows(ws, full_headers, full_rows)

search_ws = wb.create_sheet('Search Friendly')
search_headers = [
    'Subheading',
    'Description',
    'Heading',
    'Chapter',
    'General Duty',
    'Excise',
    'VAT',
    'AIT',
]
search_rows = []
for record in records:
    search_rows.append([
        record.get('subheading', ''),
        record.get('description', ''),
        record.get('heading', ''),
        record.get('chapter', ''),
        record.get('dutyGeneral', ''),
        display_excise(record),
        display_vat(record),
        display_ait(record),
    ])
write_rows(search_ws, search_headers, search_rows)

search_ws['A1'] = 'Search tariff lookup'
search_ws['A1'].font = Font(bold=True, size=14)
search_ws['B2'] = ''
search_ws['B2'].border = Border(left=Side(style='thin'), right=Side(style='thin'), top=Side(style='thin'), bottom=Side(style='thin'))
search_ws['B2'].alignment = Alignment(horizontal='left')
search_ws['D2'] = 'Search'
search_ws['D2'].fill = PatternFill('solid', fgColor='D9EAD3')
search_ws['D2'].font = Font(bold=True)
search_ws['D2'].border = Border(left=Side(style='thin'), right=Side(style='thin'), top=Side(style='thin'), bottom=Side(style='thin'))
search_ws['D2'].alignment = Alignment(horizontal='center')
search_ws['A4'] = 'Type HS code or description in B2 and use the Search button area above.'
search_ws['A4'].font = Font(size=11)
search_ws['A5'] = 'Results will appear below the header row.'
search_ws['A5'].font = Font(size=11)
search_ws.delete_rows(2, 1)
search_ws.insert_rows(1, 5)
search_ws['A1'] = 'Search tariff lookup'
search_ws['A1'].font = Font(bold=True, size=14)
search_ws['B3'] = ''
search_ws['B3'].border = Border(left=Side(style='thin'), right=Side(style='thin'), top=Side(style='thin'), bottom=Side(style='thin'))
search_ws['B3'].alignment = Alignment(horizontal='left')
search_ws['D3'] = 'Search'
search_ws['D3'].fill = PatternFill('solid', fgColor='D9EAD3')
search_ws['D3'].font = Font(bold=True)
search_ws['D3'].border = Border(left=Side(style='thin'), right=Side(style='thin'), top=Side(style='thin'), bottom=Side(style='thin'))
search_ws['D3'].alignment = Alignment(horizontal='center')
search_ws['A5'] = 'Type HS code or description in B3 and use the Search button above.'
search_ws['A6'] = 'Results will appear below this row.'
search_ws['A6'].font = Font(size=11)
search_ws['A7'] = 'Search results will appear here.'
search_ws['A7'].font = Font(italic=True)

# Rebuild the search sheet rows after inserting the search bar area
search_ws.delete_rows(8, search_ws.max_row - 7)
search_ws.append([])
search_ws.append(search_headers)
for row in search_rows:
    search_ws.append(row)
style_header(search_ws)
for col in range(1, len(search_headers) + 1):
    search_ws.column_dimensions[get_column_letter(col)].width = 18
search_ws.freeze_panes = 'A9'

wb.save('tariff-lookup-v3.xlsx')
print('Created tariff-lookup-v3.xlsx')
