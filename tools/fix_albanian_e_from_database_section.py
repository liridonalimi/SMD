from pathlib import Path
import re
import shutil
import zipfile
import xml.etree.ElementTree as ET


SOURCE = Path(r"C:\Users\ljaljimi\source\repos\SMD\shqip_Master_thesis_04_05_2026_referenca_shtuar.docx")
OUT = Path(r"C:\Users\ljaljimi\source\repos\SMD\shqip_Master_thesis_04_05_2026_referenca_shtuar_e_korrigjuar.docx")

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W_NS}
ET.register_namespace("w", W_NS)


WORD_REPLACEMENTS = {
    "Per": "Për",
    "per": "për",
    "Eshte": "Është",
    "eshte": "është",
    "Jane": "Janë",
    "jane": "janë",
    "Nje": "Një",
    "nje": "një",
    "Kete": "Këtë",
    "kete": "këtë",
    "Keto": "Këto",
    "keto": "këto",
    "Vetem": "Vetëm",
    "vetem": "vetëm",
    "Nese": "Nëse",
    "nese": "nëse",
    "Ne": "Në",
    "ne": "në",
    "Qe": "Që",
    "qe": "që",
    "Ndersa": "Ndërsa",
    "ndersa": "ndërsa",
    "Ndermjet": "Ndërmjet",
    "ndermjet": "ndërmjet",
    "Permes": "Përmes",
    "permes": "përmes",
    "Menyrë": "Mënyrë",
    "menyrë": "mënyrë",
    "Menyre": "Mënyrë",
    "menyre": "mënyrë",
    "Menyren": "Mënyrën",
    "menyren": "mënyrën",
    "Baze": "Bazë",
    "baze": "bazë",
    "Pjese": "Pjesë",
    "pjese": "pjesë",
    "Rendesishme": "Rëndësishme",
    "rendesishme": "rëndësishme",
    "Rendesishem": "Rëndësishëm",
    "rendesishem": "rëndësishëm",
    "Rendesia": "Rëndësia",
    "rendesia": "rëndësia",
    "Rendesise": "Rëndësisë",
    "rendesise": "rëndësisë",
    "Hyrese": "Hyrëse",
    "hyrese": "hyrëse",
    "Hyres": "Hyrës",
    "hyres": "hyrës",
    "Dalese": "Dalëse",
    "dalese": "dalëse",
    "Dales": "Dalës",
    "dales": "dalës",
    "Levizje": "Lëvizje",
    "levizje": "lëvizje",
    "Levizjet": "Lëvizjet",
    "levizjet": "lëvizjet",
    "Levizjes": "Lëvizjes",
    "levizjes": "lëvizjes",
    "Levizjeve": "Lëvizjeve",
    "levizjeve": "lëvizjeve",
    "Sasine": "Sasinë",
    "sasine": "sasinë",
    "Dhenat": "Dhënat",
    "dhenat": "dhënat",
    "Dhenave": "Dhënave",
    "dhenave": "dhënave",
    "Mundesoje": "Mundësojë",
    "mundesoje": "mundësojë",
    "Mundeson": "Mundëson",
    "mundeson": "mundëson",
    "Mundesuar": "Mundësuar",
    "mundesuar": "mundësuar",
    "Mundesi": "Mundësi",
    "mundesi": "mundësi",
    "Mundesite": "Mundësitë",
    "mundesite": "mundësitë",
    "Perdoruesi": "Përdoruesi",
    "perdoruesi": "përdoruesi",
    "Perdoruesit": "Përdoruesit",
    "perdoruesit": "përdoruesit",
    "Perdoruesve": "Përdoruesve",
    "perdoruesve": "përdoruesve",
    "Perdorues": "Përdorues",
    "perdorues": "përdorues",
    "Perdoret": "Përdoret",
    "perdoret": "përdoret",
    "Perdoren": "Përdoren",
    "perdoren": "përdoren",
    "Perdorur": "Përdorur",
    "perdorur": "përdorur",
    "Perdorim": "Përdorim",
    "perdorim": "përdorim",
    "Perdorimi": "Përdorimi",
    "perdorimi": "përdorimi",
    "Perdorimin": "Përdorimin",
    "perdorimin": "përdorimin",
    "Mbeshtet": "Mbështet",
    "mbeshtet": "mbështet",
    "Mbeshtetur": "Mbështetur",
    "mbeshtetur": "mbështetur",
    "Gjithe": "Gjithë",
    "gjithe": "gjithë",
    "Gjithashtu": "Gjithashtu",
    "gjithashtu": "gjithashtu",
    "Gjate": "Gjatë",
    "gjate": "gjatë",
    "Kerkesat": "Kërkesat",
    "kerkesat": "kërkesat",
    "Kerkesave": "Kërkesave",
    "kerkesave": "kërkesave",
    "Kerkesa": "Kërkesa",
    "kerkesa": "kërkesa",
    "Plotesohet": "Plotësohet",
    "plotesohet": "plotësohet",
    "Plotesimin": "Plotësimin",
    "plotesimin": "plotësimin",
    "Konfirmohet": "Konfirmohet",
    "konfirmohet": "konfirmohet",
    "Përmbledheje": "Përmbledhje",
    "permbledheje": "përmbledhje",
    "Permbledhje": "Përmbledhje",
    "permbledhje": "përmbledhje",
    "Perfundime": "Përfundime",
    "perfundime": "përfundime",
    "Perfundimtare": "Përfundimtare",
    "perfundimtare": "përfundimtare",
    "Pikepamja": "Pikëpamja",
    "pikepamja": "pikëpamja",
    "Databazes": "Databazës",
    "databazes": "databazës",
    "Tabelen": "Tabelën",
    "tabelen": "tabelën",
    "Permban": "Përmban",
    "permban": "përmban",
    "Permbajne": "Përmbajnë",
    "permbajne": "përmbajnë",
    "Emer": "Emër",
    "emer": "emër",
    "Njesi": "Njësi",
    "njesi": "njësi",
    "Matese": "Matëse",
    "matese": "matëse",
    "Perkatese": "Përkatëse",
    "perkatese": "përkatëse",
    "Pergjithshme": "Përgjithshme",
    "pergjithshme": "përgjithshme",
    "Ben": "Bën",
    "ben": "bën",
    "Ruajne": "Ruajnë",
    "ruajne": "ruajnë",
    "Tregojne": "Tregojnë",
    "tregojne": "tregojnë",
    "Kane": "Kanë",
    "kane": "kanë",
    "Strukture": "Strukturë",
    "strukture": "strukturë",
    "Strukturen": "Strukturën",
    "strukturen": "strukturën",
    "Zgjerueshem": "Zgjerueshëm",
    "zgjerueshem": "zgjerueshëm",
    "Pershtatshem": "Përshtatshëm",
    "pershtatshem": "përshtatshëm",
    "Sasite": "Sasitë",
    "sasite": "sasitë",
    "Pare": "Parë",
    "pare": "parë",
    "Platforme": "Platformë",
    "platforme": "platformë",
    "Perdorueshme": "Përdorueshme",
    "perdorueshme": "përdorueshme",
    "Perdorueshmeria": "Përdorueshmëria",
    "perdorueshmeria": "përdorueshmëria",
    "Perseri": "Përsëri",
    "perseri": "përsëri",
    "Sherbime": "Shërbime",
    "sherbime": "shërbime",
    "Sherbimeve": "Shërbimeve",
    "sherbimeve": "shërbimeve",
    "Furnizueseve": "Furnizuesëve",
    "furnizueseve": "furnizuesëve",
    "Klienteve": "Klientëve",
    "klienteve": "klientëve",
    "Klientet": "Klientët",
    "klientet": "klientët",
    "Partneret": "Partnerët",
    "partneret": "partnerët",
    "Lokacioneve": "Lokacioneve",
    "lokacioneve": "lokacioneve",
    "Saktesia": "Saktësia",
    "saktesia": "saktësia",
    "Saktesine": "Saktësinë",
    "saktesine": "saktësinë",
    "Shpejtesia": "Shpejtësia",
    "shpejtesia": "shpejtësia",
    "Efikasitet": "Efikasitet",
    "efikasitet": "efikasitet",
    "Zone": "Zonë",
    "zone": "zonë",
    "Gjurmuëshmeri": "Gjurmueshmëri",
    "gjurmuëshmeri": "gjurmueshmëri",
    "Gjurmueshmeri": "Gjurmueshmëri",
    "gjurmueshmeri": "gjurmueshmëri",
    "Gjurmueshmerine": "Gjurmueshmërinë",
    "gjurmueshmerine": "gjurmueshmërinë",
    "Gjurmueshmerise": "Gjurmueshmërisë",
    "gjurmueshmerise": "gjurmueshmërisë",
    "Meposhtem": "Mëposhtëm",
    "meposhtem": "mëposhtëm",
    "Perkatese": "Përkatëse",
    "perkatese": "përkatëse",
    "Partnere": "Partnerë",
    "partnere": "partnerë",
    "Qarte": "Qartë",
    "qarte": "qartë",
    "Larte": "Lartë",
    "larte": "lartë",
    "Mjaftueshem": "Mjaftueshëm",
    "mjaftueshem": "mjaftueshëm",
}

PHRASE_REPLACEMENTS = {
    "per te": "për të",
    "Per te": "Për të",
    "duhet te kete": "duhet të ketë",
    "duhet te": "duhet të",
    "mund te kete": "mund të ketë",
    "mund te": "mund të",
    "mund të këtë": "mund të ketë",
    "duhet të këtë": "duhet të ketë",
    "ka te": "ka të",
    "kane te": "kanë të",
    "jane te": "janë të",
    "eshte te": "është të",
    "duke qene": "duke qenë",
    "te dhenat": "të dhënat",
    "te dhenave": "të dhënave",
    "te perdoruesit": "të përdoruesit",
    "te perdoruesve": "të përdoruesve",
    "te sistemit": "të sistemit",
    "te stokut": "të stokut",
    "te depos": "të depos",
    "te dokumentit": "të dokumentit",
    "te dokumenteve": "të dokumenteve",
    "te inventarit": "të inventarit",
    "te produktit": "të produktit",
    "te produkteve": "të produkteve",
    "te pranimit": "të pranimit",
    "te menaxhimit": "të menaxhimit",
    "te pavarura": "të pavarura",
    "te caktuar": "të caktuar",
    "te levizjes": "të lëvizjes",
    "te thjeshtuar": "të thjeshtuar",
    "te lidhjeve": "të lidhjeve",
    "te reja": "të reja",
    "te gjitha": "të gjitha",
    "te cilat": "të cilat",
    "te klientit": "të klientit",
    "te klienteve": "të klientëve",
    "te ndryshme": "të ndryshme",
    "te ardhshme": "të ardhshme",
    "te rendesishme": "të rëndësishme",
    "te rendesishem": "të rëndësishëm",
    "te qarte": "të qartë",
    "te sakta": "të sakta",
    "te shpejte": "të shpejtë",
    "te mjaftueshem": "të mjaftueshëm",
    "ne menyre": "në mënyrë",
    "ne kete": "në këtë",
    "ne sistem": "në sistem",
    "ne sistemin": "në sistemin",
    "ne backend": "në backend",
    "ne frontend": "në frontend",
    "ne databaze": "në databazë",
    "ne inventar": "në inventar",
    "ne depo": "në depo",
    "ne dokumente": "në dokumente",
    "ne nivel": "në nivel",
    "ne rast": "në rast",
    "ne fund": "në fund",
    "ne te ardhmen": "në të ardhmen",
}


def replace_words(text: str) -> tuple[str, int]:
    count = 0

    for old, new in PHRASE_REPLACEMENTS.items():
        pattern = re.compile(rf"(?<!\w){re.escape(old)}(?!\w)")
        text, n = pattern.subn(new, text)
        count += n
        pattern_title = re.compile(rf"(?<!\w){re.escape(old.capitalize())}(?!\w)")
        text, n = pattern_title.subn(new.capitalize(), text)
        count += n

    def repl(match):
        nonlocal count
        word = match.group(0)
        if word in WORD_REPLACEMENTS:
            count += 1
            return WORD_REPLACEMENTS[word]
        return word

    text = re.sub(r"(?<![\w:/])[A-Za-zÇçËë]+(?![\w:/])", repl, text)
    return text, count


def paragraph_text(paragraph):
    return "".join(t.text or "" for t in paragraph.findall(".//w:t", NS)).strip()


def main():
    shutil.copyfile(SOURCE, OUT)

    with zipfile.ZipFile(SOURCE, "r") as zin:
        files = {name: zin.read(name) for name in zin.namelist()}

    root = ET.fromstring(files["word/document.xml"])
    active = False
    total = 0

    for paragraph in root.findall(".//w:p", NS):
        text = paragraph_text(paragraph)
        if text == "Referencat":
            active = False
        if text == "Projektimi i databazës":
            active = True

        if active:
            for t in paragraph.findall(".//w:t", NS):
                if t.text:
                    updated, n = replace_words(t.text)
                    if n:
                        t.text = updated
                        total += n

    files["word/document.xml"] = ET.tostring(root, encoding="utf-8", xml_declaration=True)

    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as zout:
        for name, data in files.items():
            zout.writestr(name, data)

    print(f"saved={OUT}")
    print(f"replacements={total}")


if __name__ == "__main__":
    main()
