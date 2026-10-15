import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { localDateTime, fiscalTimeZone, fixed2 } from "./fiscal-format";

interface SaftExportOptions {
  businessId: string;
  storeId?: string;
  startDate: Date;
  endDate: Date;
  type: "FACTURACAO" | "INVENTARIOS";
}

@Injectable()
export class SaftExportService {
  constructor(private prisma: PrismaService) {}

  async exportFacturacao(options: SaftExportOptions): Promise<string> {
    const { businessId, storeId, startDate, endDate } = options;

    // Load business, stores, fiscal documents, customers, suppliers, products
    const [business, stores, documents, customers, suppliers, products, taxRates] = await Promise.all([
      this.prisma.business.findUnique({ where: { id: businessId } }),
      storeId
        ? this.prisma.store.findUnique({ where: { id: storeId } })
        : this.prisma.store.findMany({ where: { businessId } }),
      this.prisma.fiscalDocument.findMany({
        where: {
          businessId,
          ...(storeId && { storeId }),
          invoiceDate: { gte: startDate, lte: endDate },
          status: "N",
        },
        include: {
          lines: { include: { taxes: true } },
          series: true,
          customer: true,
        },
        orderBy: { invoiceDate: "asc" },
      }),
      this.prisma.customer.findMany({ where: { businessId } }),
      this.prisma.supplier.findMany({ where: { businessId } }),
      this.prisma.product.findMany({ where: { businessId } }),
      this.prisma.taxRate.findMany({ where: { businessId, active: true } }),
    ]);

    if (!business) throw new BadRequestException("Business not found");
    if (!Array.isArray(stores) && storeId) {
      throw new BadRequestException("Store not found");
    }

    const storeList = Array.isArray(stores) ? stores : [stores];

    // Build XML manually
    return this.buildSaftXml(business, customers, suppliers, products, taxRates, documents, storeList, startDate, endDate, storeId);
  }

  private buildSaftXml(
    business: any,
    customers: any[],
    suppliers: any[],
    products: any[],
    taxRates: any[],
    documents: any[],
    stores: any[],
    startDate: Date,
    endDate: Date,
    storeId?: string,
  ): string {
    const tz = fiscalTimeZone(null, "Africa/Luanda");
    const startDt = localDateTime(startDate, tz);
    const endDt = localDateTime(endDate, tz);
    const now = new Date();
    const createdDt = localDateTime(now, tz);

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<AuditFile xmlns="urn:OECD:StandardAuditFile-Tax:AO_1.01_01">\n`;

    // Header
    xml += `  <Header>\n`;
    xml += `    <AuditFileVersion>1.01_01</AuditFileVersion>\n`;
    xml += `    <CompanyID>${this.escape(business.taxId || "")}</CompanyID>\n`;
    xml += `    <TaxRegistrationNumber>${this.escape(business.taxId || "")}</TaxRegistrationNumber>\n`;
    xml += `    <TaxAccountingBasis>F</TaxAccountingBasis>\n`;
    xml += `    <CompanyName>${this.escape(business.legalName || business.name)}</CompanyName>\n`;
    if (business.address) {
      xml += `    <CompanyAddress>\n`;
      xml += `      <AddressDetail>${this.escape(business.address)}</AddressDetail>\n`;
      xml += `      <City>${this.escape(business.city || "")}</City>\n`;
      xml += `      <PostalCode>${this.escape(business.postalCode || "")}</PostalCode>\n`;
      xml += `      <Province>${this.escape(business.province || "")}</Province>\n`;
      xml += `      <Country>${this.escape(business.country || "AO")}</Country>\n`;
      xml += `    </CompanyAddress>\n`;
    }
    xml += `    <FiscalYear>${startDt.year}</FiscalYear>\n`;
    xml += `    <StartDate>${startDt.date}</StartDate>\n`;
    xml += `    <EndDate>${endDt.date}</EndDate>\n`;
    xml += `    <CurrencyCode>${business.currency || "AOA"}</CurrencyCode>\n`;
    xml += `    <DateCreated>${createdDt.dateTime}</DateCreated>\n`;
    xml += `    <TaxEntity>${storeId ? "Store" : "Global"}</TaxEntity>\n`;
    xml += `    <ProductCompanyTaxID>999999999</ProductCompanyTaxID>\n`;
    xml += `    <ProductID>POS</ProductID>\n`;
    xml += `    <ProductVersion>1.0</ProductVersion>\n`;
    xml += `    <SoftwareValidationNumber>0</SoftwareValidationNumber>\n`;
    xml += `  </Header>\n`;

    // MasterFiles
    xml += `  <MasterFiles>\n`;

    // Customers
    for (const customer of customers) {
      xml += this.buildCustomerXml(customer);
    }

    // Suppliers
    for (const supplier of suppliers) {
      xml += this.buildSupplierXml(supplier);
    }

    // Products
    for (const product of products) {
      xml += this.buildProductXml(product);
    }

    // TaxTable
    xml += `    <TaxTable>\n`;
    for (const rate of taxRates) {
      xml += `      <TaxEntry>\n`;
      xml += `        <TaxType>IVA</TaxType>\n`;
      xml += `        <Description>${this.escape(rate.name)}</Description>\n`;
      xml += `        <TaxCodeDetails>\n`;
      xml += `          <TaxCode>${this.escape(rate.taxCode)}</TaxCode>\n`;
      xml += `          <Percentage>${fixed2(rate.percentage)}</Percentage>\n`;
      xml += `          <Country>AO</Country>\n`;
      xml += `        </TaxCodeDetails>\n`;
      xml += `      </TaxEntry>\n`;
    }
    xml += `    </TaxTable>\n`;
    xml += `  </MasterFiles>\n`;

    // SourceDocuments
    xml += `  <SourceDocuments>\n`;
    xml += `    <SalesInvoices>\n`;
    for (const doc of documents) {
      xml += this.buildInvoiceXml(doc, stores);
    }
    xml += `    </SalesInvoices>\n`;
    xml += `  </SourceDocuments>\n`;

    xml += `</AuditFile>\n`;
    return xml;
  }

  private buildCustomerXml(customer: any): string {
    let xml = `    <Customer>\n`;
    xml += `      <CustomerID>${this.escape(customer.id)}</CustomerID>\n`;
    xml += `      <AccountID>${this.escape(customer.id)}</AccountID>\n`;
    xml += `      <CustomerTaxID>${this.escape(customer.taxId || "999999999")}</CustomerTaxID>\n`;
    xml += `      <CompanyName>${this.escape(customer.name)}</CompanyName>\n`;
    xml += `      <Address>\n`;
    xml += `        <AddressDetail>${this.escape(customer.address || "")}</AddressDetail>\n`;
    xml += `        <City>${this.escape(customer.city || "Luanda")}</City>\n`;
    xml += `        <PostalCode>${this.escape(customer.postalCode || "")}</PostalCode>\n`;
    xml += `        <Province>${this.escape(customer.province || "")}</Province>\n`;
    xml += `        <Country>${this.escape(customer.country || "AO")}</Country>\n`;
    xml += `      </Address>\n`;
    if (customer.phone || customer.email) {
      xml += `      <Contact>\n`;
      if (customer.phone) xml += `        <Telephone>${this.escape(customer.phone)}</Telephone>\n`;
      if (customer.email) xml += `        <Email>${this.escape(customer.email)}</Email>\n`;
      xml += `      </Contact>\n`;
    }
    xml += `    </Customer>\n`;
    return xml;
  }

  private buildSupplierXml(supplier: any): string {
    let xml = `    <Supplier>\n`;
    xml += `      <SupplierID>${this.escape(supplier.id)}</SupplierID>\n`;
    xml += `      <AccountID>${this.escape(supplier.id)}</AccountID>\n`;
    xml += `      <SupplierTaxID>${this.escape(supplier.taxId || "")}</SupplierTaxID>\n`;
    xml += `      <CompanyName>${this.escape(supplier.name)}</CompanyName>\n`;
    xml += `      <Address>\n`;
    xml += `        <AddressDetail>${this.escape(supplier.address || "")}</AddressDetail>\n`;
    xml += `        <City>${this.escape(supplier.city || "Luanda")}</City>\n`;
    xml += `        <PostalCode>${this.escape(supplier.postalCode || "")}</PostalCode>\n`;
    xml += `        <Province>${this.escape(supplier.province || "")}</Province>\n`;
    xml += `        <Country>${this.escape(supplier.country || "AO")}</Country>\n`;
    xml += `      </Address>\n`;
    if (supplier.contactName || supplier.phone || supplier.email) {
      xml += `      <Contact>\n`;
      if (supplier.contactName) xml += `        <ContactPerson>${this.escape(supplier.contactName)}</ContactPerson>\n`;
      if (supplier.phone) xml += `        <Telephone>${this.escape(supplier.phone)}</Telephone>\n`;
      if (supplier.email) xml += `        <Email>${this.escape(supplier.email)}</Email>\n`;
      xml += `      </Contact>\n`;
    }
    xml += `    </Supplier>\n`;
    return xml;
  }

  private buildProductXml(product: any): string {
    let xml = `    <Product>\n`;
    xml += `      <ProductCode>${this.escape(product.barcode || product.sku)}</ProductCode>\n`;
    xml += `      <ProductDescription>${this.escape(product.name)}</ProductDescription>\n`;
    xml += `      <ProductType>${this.escape(product.productType || "P")}</ProductType>\n`;
    xml += `      <UnitOfMeasure>${this.escape(product.unit || "un")}</UnitOfMeasure>\n`;
    xml += `      <ProductNumberCode>${this.escape(product.barcode || product.sku)}</ProductNumberCode>\n`;
    xml += `    </Product>\n`;
    return xml;
  }

  private buildInvoiceXml(doc: any, stores: any[]): string {
    const storeDetails = stores.find((s) => s.id === doc.storeId);
    const tz = fiscalTimeZone(storeDetails?.timezone, "Africa/Luanda");
    const invoiceDt = localDateTime(new Date(doc.invoiceDate), tz);
    const systemDt = localDateTime(doc.systemEntryDate, tz);

    let xml = `      <Invoice>\n`;
    xml += `        <InvoiceNo>${this.escape(doc.documentNo)}</InvoiceNo>\n`;
    xml += `        <Period>${doc.period}</Period>\n`;
    xml += `        <InvoiceDate>${invoiceDt.date}</InvoiceDate>\n`;
    xml += `        <InvoiceType>${this.escape(doc.documentType)}</InvoiceType>\n`;
    xml += `        <SourceID>${this.escape(doc.sourceId)}</SourceID>\n`;
    xml += `        <SystemEntryDate>${systemDt.dateTime}</SystemEntryDate>\n`;
    xml += `        <CustomerID>${this.escape(doc.customer?.id || "999999999")}</CustomerID>\n`;

    if (doc.buyerAddress) {
      xml += `        <BillingAddress>\n`;
      xml += `          <AddressDetail>${this.escape(doc.buyerAddress.street || "")}</AddressDetail>\n`;
      xml += `          <City>${this.escape(doc.buyerAddress.city || "Luanda")}</City>\n`;
      xml += `          <PostalCode>${this.escape(doc.buyerAddress.postalCode || "")}</PostalCode>\n`;
      xml += `          <Country>${this.escape(doc.buyerAddress.country || "AO")}</Country>\n`;
      xml += `        </BillingAddress>\n`;
    }

    xml += `        <Line>\n`;
    for (let i = 0; i < doc.lines.length; i++) {
      const line = doc.lines[i];
      xml += `          <LineNumber>${i + 1}</LineNumber>\n`;
      xml += `          <ProductCode>${this.escape(line.productCode)}</ProductCode>\n`;
      xml += `          <ProductDescription>${this.escape(line.productDescription)}</ProductDescription>\n`;
      xml += `          <Quantity>${line.quantity.toString()}</Quantity>\n`;
      xml += `          <UnitOfMeasure>${this.escape(line.unit)}</UnitOfMeasure>\n`;
      xml += `          <UnitPrice>${line.unitPrice.toFixed(6)}</UnitPrice>\n`;
      xml += `          <NetTotal>${fixed2(line.netAmount)}</NetTotal>\n`;
      xml += `          <TaxPointDate>${invoiceDt.date}</TaxPointDate>\n`;
      xml += `          <Description>${this.escape(line.productDescription)}</Description>\n`;

      for (const tax of line.taxes) {
        xml += `          <Tax>\n`;
        xml += `            <TaxType>${this.escape(tax.taxType)}</TaxType>\n`;
        xml += `            <TaxCountryRegion>${this.escape(tax.taxCountryRegion)}</TaxCountryRegion>\n`;
        xml += `            <TaxCode>${this.escape(tax.taxCode)}</TaxCode>\n`;
        xml += `            <TaxPercentage>${fixed2(tax.percentage)}</TaxPercentage>\n`;
        xml += `            <TaxAmount>${fixed2(tax.amount)}</TaxAmount>\n`;
        if (tax.exemptionCode) {
          xml += `            <TaxExemptionCode>${this.escape(tax.exemptionCode)}</TaxExemptionCode>\n`;
        }
        if (tax.exemptionReason) {
          xml += `            <TaxExemptionReason>${this.escape(tax.exemptionReason.slice(0, 50))}</TaxExemptionReason>\n`;
        }
        xml += `          </Tax>\n`;
      }

      if (line.discountAmount > 0) {
        xml += `          <SettlementAmount>${fixed2(line.discountAmount)}</SettlementAmount>\n`;
      }
    }
    xml += `        </Line>\n`;

    xml += `        <DocumentTotals>\n`;
    xml += `          <TaxPayable>${fixed2(doc.taxPayable)}</TaxPayable>\n`;
    xml += `          <NetTotal>${fixed2(doc.netTotal)}</NetTotal>\n`;
    xml += `          <GrossTotal>${fixed2(doc.grossTotal)}</GrossTotal>\n`;
    xml += `        </DocumentTotals>\n`;

    xml += `        <Hash>${this.escape(doc.hash)}</Hash>\n`;
    xml += `        <HashControl>${this.escape(doc.hashControl)}</HashControl>\n`;

    xml += `      </Invoice>\n`;
    return xml;
  }

  private escape(text: string): string {
    if (!text) return "";
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }
}
