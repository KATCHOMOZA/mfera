import pypdf, os, re
path = r'c:\Users\anton\Downloads\UPDATED CUSTOMS AND EXCISE (TARIFFS) ORDER HS 2022 VERSION - 2025-2027.pdf'
reader = pypdf.PdfReader(path)
text = '\n'.join(page.extract_text() or '' for page in reader.pages)
for query in ['8703.23.11','8703.23.12','8703.23.19','0101.21.00','8703.23.31']:
    print('QUERY', query)
    idx = text.find(query)
    if idx != -1:
        print(text[max(0, idx-400):idx+1200])
    else:
        print('not found')
    print('---')
