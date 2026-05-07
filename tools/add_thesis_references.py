from pathlib import Path

from docx import Document


SOURCE = Path(
    r"C:\Users\ljaljimi\OneDrive - KARL STORZ Endoskope\.dokumenteUniversitetiKadriZeka\Master_thesis\shqip_Master_thesis_04_05_2026.docx"
)
OUT = Path(r"C:\Users\ljaljimi\source\repos\SMD\shqip_Master_thesis_04_05_2026_referenca_shtuar.docx")


APPENDS = {
    "Sistemet e menaxhimit të depove (SMD), të njohura shpesh si Warehouse Management Systems": " Literatura e specializuar e përshkruan WMS-in si sistem për kontrollin, organizimin dhe optimizimin e proceseve të magazinimit dhe komisionimit, ndërsa studimet më të reja theksojnë rolin e tij në regjistrimin e saktë të transaksioneve, inbound/outbound management dhe integrimin ndërmjet depove (ten Hompel & Schmidt, 2007; Rachmawati & Handayani, 2024).",
    "Në një mjedis tradicional, proceset e depos mund të realizohen përmes dokumenteve fizike": " Kjo përputhet me literaturën mbi Warehousing 4.0, ku sistemet digjitale dhe IoT paraqiten si mënyra për të rritur shikueshmërinë në kohë reale, shpejtësinë dhe saktësinë e proceseve të depos (Hamdy et al., 2022).",
    "Në një sistem depoje, inventari duhet të tregojë sasinë aktuale të një produkti": " Studimet mbi vendimmarrjen në menaxhimin e inventarit tregojnë se të dhënat e strukturuara mbi SKU-të, lëvizjet dhe kërkesën historike mund të përdoren edhe për klasifikim, parashikim dhe mbështetje vendimmarrjeje në kontekstin e Industry 4.0 (de Paula Vidal et al., 2022).",
    "Përdorimi i barcode-it ndihmon në uljen e gabimeve gjatë regjistrimit manual": " Në literaturë, teknologjitë e identifikimit automatik si RFID dhe barcode lidhen me mbledhjen më të shpejtë të të dhënave, gjurmueshmëri më të mirë dhe kontroll më të saktë të inventarit në operacionet e picking-ut dhe magazinimit (Chow et al., 2009; Li et al., 2016).",
    "Inteligjenca artificiale mund të luaje rol të rëndesishëm në zhvillimin e mëtejshëm": " Rishikimet e literaturës për smart warehouse tregojnë se automatizimi, ndërlidhja e informacionit, integrimi i proceseve dhe teknologjitë inteligjente janë drejtimet kryesore të zhvillimit të depove moderne (Tiwari, 2023; Zhen & Li, 2022).",
    "Një fushë tjetër është optimizimi i lokacioneve të depove": " Qasjet e machine learning për dizajnin prediktiv të depove tregojnë se të dhënat e gjeneruara nga WMS mund të përdoren për të parashikuar strategji ruajtjeje, sisteme trajtimi materialesh dhe politika picking-u (Tufano et al., 2022).",
    "Kjo qasje e bën SMD të përshtatshëm për zgjerime inteligjente në të ardhmen": " Në literaturën për Industry 4.0 në logjistikë, këto zgjerime lidhen me decentralizimin, vetërregullimin, koordinimin në kohë reale dhe rritjen e efikasitetit operacional (Hofmann & Rüsch, 2017).",
}

NEW_REFS = [
    "Chow, H.K.H., Choy, K.L., Lee, W.B., & Lau, K.C. (2009). A RFID case-based logistics resource management system for managing order-picking operations in warehouses. Expert Systems with Applications, 36(4), 8277-8301. https://doi.org/10.1016/j.eswa.2008.10.011",
    "de Paula Vidal, G.H., Gusmão Caiado, R.G., Scavarda, L.F., Ivson, P., & Garza-Reyes, J.A. (2022). Decision support framework for inventory management combining fuzzy multicriteria methods, genetic algorithm, and artificial neural network. Computers & Industrial Engineering, 174, 108777. https://doi.org/10.1016/j.cie.2022.108777",
    "Hamdy, W., Al-Awamry, A., & Mostafa, N. (2022). Warehousing 4.0: A proposed system of using Node-RED for applying Internet of Things in warehousing. Sustainable Futures, 4, 100069. https://doi.org/10.1016/j.sftr.2022.100069",
    "Hofmann, E., & Rüsch, M. (2017). Industry 4.0 and the current status as well as future prospects on logistics. Computers in Industry, 89, 23-34. https://doi.org/10.1016/j.compind.2017.04.002",
    "Li, Z., Liu, G., Liu, L., Lai, X., & Xu, G. (2016). Application and integration of an RFID-enabled warehousing management system - a feasibility study. Journal of Industrial Information Integration, 4, 15-25. https://doi.org/10.1016/j.jii.2016.08.001",
    "Rachmawati, P.I., & Handayani, W. (2024). The Implementation of Warehouse Management System (WMS) at CV. Everfresh Kediri. Indonesian Interdisciplinary Journal of Sharia Economics, 7(3), 6387-6406. https://doi.org/10.31538/iijse.v7i3.5131",
    "ten Hompel, M., & Schmidt, T. (2007). Warehouse Management: Automation and Organisation of Warehouse and Order Picking Systems. Springer. https://doi.org/10.1007/978-3-540-35220-4",
    "Tiwari, S. (2023). Smart warehouse: A bibliometric analysis and future research direction. Sustainable Manufacturing and Service Economics, 2, 100014. https://doi.org/10.1016/j.smse.2023.100014",
    "Tufano, A., Accorsi, R., & Manzini, R. (2022). A machine learning approach for predictive warehouse design. The International Journal of Advanced Manufacturing Technology, 119, 2369-2392. https://doi.org/10.1007/s00170-021-08035-w",
    "Zhen, L., & Li, H. (2022). A literature review of smart warehouse operations management. Frontiers of Engineering Management, 9, 31-55. https://doi.org/10.1007/s42524-021-0178-9",
]


def append_once(paragraph, addition):
    if addition not in paragraph.text:
        paragraph.add_run(addition)
        return True
    return False


def main():
    doc = Document(SOURCE)
    changes = []

    for marker, addition in APPENDS.items():
        for paragraph in doc.paragraphs:
            if marker in paragraph.text:
                if append_once(paragraph, addition):
                    changes.append(marker[:60])
                break
        else:
            raise RuntimeError(f"Paragraph marker not found: {marker}")

    appendix_para = None
    for paragraph in doc.paragraphs:
        if paragraph.text.strip() == "Appendix, Shtojcat":
            appendix_para = paragraph
            break
    if appendix_para is None:
        raise RuntimeError("Appendix insertion point not found")

    for ref in NEW_REFS:
        p = appendix_para.insert_paragraph_before(ref)
        p.style = appendix_para.style

    doc.save(OUT)
    print(f"saved={OUT}")
    print(f"citation_paragraphs_updated={len(changes)}")
    print(f"references_added={len(NEW_REFS)}")


if __name__ == "__main__":
    main()
