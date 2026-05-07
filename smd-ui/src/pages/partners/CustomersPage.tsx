import PartnerDirectoryPage from "./PartnerDirectoryPage";
import { createCustomer, importCustomers, listCustomers, updateCustomer } from "../../services/partners";

export default function CustomersPage() {
  return (
    <PartnerDirectoryPage
      title="Klientet"
      subtitle="Regjistro dhe menaxho klientet qe do lidhen me dokumentet outbound."
      entityLabel="Klient"
      listItems={listCustomers}
      createItem={createCustomer}
      updateItem={updateCustomer}
      importFile={importCustomers}
    />
  );
}
