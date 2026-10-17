import type { PrismaService } from "../src/prisma/prisma.service";

/**
 * Deletes a business the test signed up, and everything in it, children
 * first. One list for every suite, so a new table only needs adding here.
 */
export async function deleteBusiness(prisma: PrismaService, businessId: string): Promise<void> {
  const stores = (await prisma.store.findMany({ where: { businessId }, select: { id: true } })).map((s) => s.id);
  const users = (await prisma.user.findMany({ where: { businessId }, select: { id: true } })).map((u) => u.id);
  const inStores = { storeId: { in: stores } };
  const byUsers = { userId: { in: users } };

  await deleteBooks(prisma, businessId);
  await prisma.$transaction([
    // Fiscal documents are immutable; only a clean-up session may delete them.
    prisma.$executeRaw`SELECT set_config('pos.allow_fiscal_delete', 'on', true)`,
    prisma.customerPaymentAllocation.deleteMany({ where: { payment: { businessId } } }),
    prisma.customerPayment.deleteMany({ where: { businessId } }),
    prisma.documentPrint.deleteMany({ where: { document: { businessId } } }),
    prisma.agtSubmission.deleteMany({ where: { businessId } }),
    prisma.fiscalDocumentLineTax.deleteMany({ where: { line: { document: { businessId } } } }),
    prisma.fiscalDocumentLine.deleteMany({ where: { document: { businessId } } }),
    prisma.fiscalDocument.deleteMany({ where: { businessId } }),
    prisma.documentSeries.deleteMany({ where: { businessId } }),
    prisma.fiscalChainAlert.deleteMany({ where: { businessId } }),
    prisma.invoice.deleteMany({ where: { businessId } }),
    prisma.invoiceCounter.deleteMany({ where: { businessId } }),
    prisma.returnLineItem.deleteMany({ where: { return: inStores } }),
    prisma.return.deleteMany({ where: inStores }),
    prisma.salePayment.deleteMany({ where: { sale: inStores } }),
    prisma.saleLineItem.deleteMany({ where: { sale: inStores } }),
    prisma.drawerEvent.deleteMany({ where: { businessId } }),
    prisma.sale.deleteMany({ where: inStores }),
    prisma.cashMovement.deleteMany({ where: { shift: { businessId } } }),
    prisma.shift.deleteMany({ where: { businessId } }),
    prisma.supplierPaymentAllocation.deleteMany({ where: { payment: { businessId } } }),
    prisma.supplierPayment.deleteMany({ where: { businessId } }),
    prisma.purchaseTaxLine.deleteMany({ where: { purchase: inStores } }),
    prisma.purchaseLineItem.deleteMany({ where: { purchase: inStores } }),
    prisma.purchase.deleteMany({ where: inStores }),
    prisma.expense.deleteMany({ where: inStores }),
    prisma.stockTransferLineItem.deleteMany({ where: { transfer: { businessId } } }),
    prisma.stockTransfer.deleteMany({ where: { businessId } }),
    prisma.stockMovement.deleteMany({ where: inStores }),
    prisma.inventoryItem.deleteMany({ where: inStores }),
    prisma.terminalPairingCode.deleteMany({ where: { businessId } }),
    prisma.terminal.deleteMany({ where: { businessId } }),
    prisma.managerOverride.deleteMany({ where: { businessId } }),
    prisma.auditLog.deleteMany({ where: { businessId } }),
    prisma.employee.deleteMany({ where: { businessId } }),
    prisma.accountantAccess.deleteMany({ where: { OR: [{ businessId }, byUsers] } }),
    prisma.storeUser.deleteMany({ where: byUsers }),
    prisma.userPermission.deleteMany({ where: byUsers }),
    prisma.refreshToken.deleteMany({ where: byUsers }),
    prisma.passwordResetToken.deleteMany({ where: byUsers }),
    prisma.emailVerificationToken.deleteMany({ where: byUsers }),
    prisma.bankAccount.deleteMany({ where: { businessId } }),
    prisma.taxRate.deleteMany({ where: { businessId } }),
    prisma.customer.deleteMany({ where: { businessId } }),
    prisma.supplier.deleteMany({ where: { businessId } }),
    prisma.productPhoto.deleteMany({ where: { product: { businessId } } }),
    prisma.product.deleteMany({ where: { businessId } }),
    prisma.category.deleteMany({ where: { businessId } }),
    prisma.user.deleteMany({ where: { businessId } }),
    prisma.store.deleteMany({ where: { businessId } }),
    prisma.business.delete({ where: { id: businessId } }),
  ]);
}

/**
 * The accounting tables: entries are immutable too (the same clean-up
 * setting lets them go), and an estorno must go before what it reverses.
 */
async function deleteBooks(prisma: PrismaService, businessId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('pos.allow_fiscal_delete', 'on', true)`;
    await tx.accountingSourceLink.deleteMany({ where: { businessId } });
    await tx.accountingIntegrationError.deleteMany({ where: { businessId } });
    await tx.accountMapping.deleteMany({ where: { businessId } });
    await tx.entryTemplate.deleteMany({ where: { businessId } });
    await tx.journalEntryLine.deleteMany({ where: { entry: { businessId } } });
    for (let i = 0; i < 50 && (await tx.journalEntry.count({ where: { businessId } })); i++) {
      await tx.journalEntry.deleteMany({ where: { businessId, reversedBy: { is: null } } });
    }
    await tx.journalCounter.deleteMany({ where: { journal: { businessId } } });
    await tx.journal.deleteMany({ where: { businessId } });
    await tx.accountingPeriod.deleteMany({ where: { businessId } });
    await tx.fiscalYear.deleteMany({ where: { businessId } });
    await tx.ledgerAccount.updateMany({ where: { businessId }, data: { parentId: null } });
    await tx.ledgerAccount.deleteMany({ where: { businessId } });
    await tx.accountingSettings.deleteMany({ where: { businessId } });
  }, { timeout: 60_000 });
}
