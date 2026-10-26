import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import { randomUUID } from "crypto";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { MailService } from "../src/common/mail/mail.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { deleteBusiness } from "./cleanup";

/**
 * Outside accountants (docs/ACCOUNTING-DECISIONS.md, B1): invited by email,
 * one login for several companies, full rights in the books, read-only
 * elsewhere, no till work; access can be taken away.
 */
describe("Accountants (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const RUN = Date.now();
  const PASSWORD = "AccountantPass123!";
  const accountantEmail = `acc-contabilista-${RUN}@e2e.test`;
  const businesses: string[] = [];
  const owners: string[] = [];
  const stores: string[] = [];
  let inviteToken: string | undefined;
  /** The last "another company gives you access" email: who it went to, and its accept link's token. */
  let accessEmail: { to: string; businessName: string; inviterName: string; token: string } | undefined;
  let accountantToken: string;
  let accountantCookie: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({
        sendStaffInviteEmail: async (_to: string, p: { token: string }) => {
          inviteToken = p.token;
        },
        sendAccountantAccessEmail: async (to: string, p: { businessName: string; inviterName: string; token: string }) => {
          accessEmail = { to, ...p };
        },
        sendEmailVerificationEmail: async () => undefined,
        sendPasswordResetEmail: async () => undefined,
      })
      .compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    for (const name of ["Cliente Um", "Cliente Dois", "Cliente Tres"]) {
      const reg = await http()
        .post("/auth/register")
        .send({ businessName: `${name} Lda`, storeName: `Loja ${name}`, firstName: "Dono", lastName: name, email: `acc-owner-${name.replace(" ", "")}-${RUN}@e2e.test`, password: PASSWORD })
        .expect(201);
      businesses.push(reg.body.user.businessId);
      owners.push(reg.body.accessToken);
      stores.push(reg.body.stores[0].id);
      await http().patch("/accounting/settings").set(auth(reg.body.accessToken)).send({ enabled: true }).expect(200);
    }
  }, 60_000);

  afterAll(async () => {
    try {
      for (const b of businesses) await deleteBusiness(prisma, b);
    } finally {
      await app.close();
    }
  });

  it("a staff login's email can't become an accountant: they need their own email address", async () => {
    const ownEmail = `acc-owner-ClienteUm-${RUN}@e2e.test`;
    const res = await http().post("/accounting/accountants").set(auth(owners[0])).send({ email: ownEmail, firstName: "Dono", lastName: "Um" }).expect(409);
    expect(res.body.message).toBe("That email is already a staff login here. An accountant needs their own email address.");
    const pt = await http().post("/accounting/accountants").set(auth(owners[0])).set("X-Language", "pt-AO").send({ email: ownEmail, firstName: "Dono", lastName: "Um" }).expect(409);
    expect(pt.body.message).toMatch(/precisa de um endereço de email próprio/);
  });

  it("the owner invites an accountant by email: a new login, password chosen from the email", async () => {
    await http().post("/accounting/accountants").set(auth(owners[0])).send({ email: accountantEmail, firstName: "Carla", lastName: "Contabilista", ocpcaNumber: "OCPCA-1234" }).expect(201);
    expect(inviteToken).toBeTruthy();
    await http().post("/auth/reset-password").send({ token: inviteToken, newPassword: PASSWORD }).expect(200);
    const login = await http().post("/auth/login").send({ email: accountantEmail, password: PASSWORD }).expect(200);
    expect(login.body.user).toMatchObject({ role: "ACCOUNTANT", businessId: businesses[0] });
    expect(login.body.stores.map((s: { id: string }) => s.id)).toEqual([stores[0]]);
    accountantToken = login.body.accessToken;
    accountantCookie = (login.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("refresh_token="))!.split(";")[0];
    const list = (await http().get("/accounting/accountants").set(auth(owners[0])).expect(200)).body;
    // Choosing the password accepted it: not pending.
    expect(list).toEqual([expect.objectContaining({ email: accountantEmail, ocpcaNumber: "OCPCA-1234", pending: false })]);
    // Not one of the staff.
    const staff = (await http().get("/users").set(auth(owners[0])).expect(200)).body as { email: string }[];
    expect(staff.some((u) => u.email === accountantEmail)).toBe(false);
  });

  it("a second company invites the same login: an email, and a pending invitation in their client list until accepted", async () => {
    inviteToken = undefined;
    accessEmail = undefined;
    const second = (await http().post("/accounting/accountants").set(auth(owners[1])).send({ email: accountantEmail, firstName: "Carla", lastName: "Contabilista" }).expect(201)).body;
    expect(second).toMatchObject({ newLogin: false, pending: true });
    // No password to choose; an email saying who gave access, with an accept link.
    expect(inviteToken).toBeUndefined();
    expect(accessEmail).toMatchObject({ to: accountantEmail, businessName: "Cliente Dois Lda", inviterName: "Dono Cliente Dois" });
    expect(accessEmail!.token.length).toBeGreaterThan(20);
    const again = await http().post("/accounting/accountants").set(auth(owners[1])).send({ email: accountantEmail, firstName: "Carla", lastName: "Contabilista" }).expect(409);
    expect(again.body.message).toBe("This accountant has already been invited");
    expect((await http().get("/accounting/accountants").set(auth(owners[1])).expect(200)).body).toEqual([expect.objectContaining({ email: accountantEmail, pending: true })]);

    type Client = { businessId: string; invitation: string; current?: boolean; accountingEnabled?: boolean; invitedBy?: string };
    const before = (await http().get("/accountant/clients").set(auth(accountantToken)).expect(200)).body as Client[];
    expect(before.map((c) => [c.businessId, c.invitation])).toEqual([
      [businesses[1], "PENDING"],
      [businesses[0], "ACCEPTED"],
    ]);
    expect(before[0]).toMatchObject({ name: "Cliente Dois Lda", invitedBy: "Dono Cliente Dois" });
    // Pending: nothing of that company is open to them.
    const refused = await http().post("/auth/switch-business").set(auth(accountantToken)).send({ businessId: businesses[1] }).expect(401);
    expect(refused.body.message).toBe("Accept this company's invitation first");
    await http().post(`/accountant/invitations/${businesses[0]}/accept`).set(auth(accountantToken)).expect(404);
    await http().post(`/accountant/invitations/${businesses[1]}/accept`).set(auth(owners[1])).expect(403);

    await http().post(`/accountant/invitations/${businesses[1]}/accept`).set(auth(accountantToken)).expect(200);
    // The email's link is spent once accepted in the app.
    await http().post("/accountant/invitations/accept-link").send({ token: accessEmail!.token }).expect(400);
    expect((await http().get("/accounting/accountants").set(auth(owners[1])).expect(200)).body).toEqual([expect.objectContaining({ email: accountantEmail, pending: false })]);
    const clients = (await http().get("/accountant/clients").set(auth(accountantToken)).expect(200)).body as Client[];
    expect(clients.map((c) => [c.businessId, c.invitation, c.current, c.accountingEnabled])).toEqual([
      [businesses[0], "ACCEPTED", true, true],
      [businesses[1], "ACCEPTED", false, true],
    ]);
    expect(await prisma.auditLog.count({ where: { businessId: businesses[1], action: "ACCOUNTANT_ACCEPTED" } })).toBe(1);
  });

  it("once accepted, the accountant switches between the two", async () => {
    const switched = await http().post("/auth/switch-business").set(auth(accountantToken)).send({ businessId: businesses[1] }).expect(200);
    expect(switched.body.user.businessId).toBe(businesses[1]);
    expect(switched.body.business.name).toBe("Cliente Dois Lda");
    accountantToken = switched.body.accessToken;
    accountantCookie = (switched.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("refresh_token="))!.split(";")[0];
    // The refreshed session stays in the client it was in.
    const refreshed = await http().post("/auth/refresh").set("Cookie", accountantCookie).expect(200);
    const statusAfter = (await http().get("/accounting/status").set(auth(refreshed.body.accessToken)).expect(200)).body;
    expect(statusAfter.enabled).toBe(true);
    const me = (await http().get("/accounting/accounts").set(auth(refreshed.body.accessToken)).expect(200)).body as unknown[];
    expect(me.length).toBeGreaterThan(100);
    // A company that never invited them is out of reach.
    await http().post("/auth/switch-business").set(auth(accountantToken)).send({ businessId: "nope" }).expect(401);
  });

  it("in the books: full rights; elsewhere: reads, never sells, buys or touches staff", async () => {
    const journals = (await http().get("/accounting/journals").set(auth(accountantToken)).expect(200)).body as { id: string; code: string }[];
    const accounts = (await http().get("/accounting/accounts").set(auth(accountantToken)).expect(200)).body as { id: string; code: string }[];
    const id = (code: string) => accounts.find((a) => a.code === code)!.id;
    await http()
      .post("/accounting/entries")
      .set(auth(accountantToken))
      .send({ journalId: journals.find((j) => j.code === "OPD")!.id, transactionDate: "2026-03-10", description: "Comissão bancária", lines: [{ accountId: id("76.8"), debit: 500 }, { accountId: id("43.1.1"), credit: 500 }] })
      .expect(201);
    await http().get("/accounting/reports/trialBalance?year=2026").set(auth(accountantToken)).expect(200);
    // Reads what a manager reads.
    await http().get(`/purchases?storeId=${stores[1]}`).set(auth(accountantToken)).expect(200);
    await http().get("/fiscal-documents").set(auth(accountantToken)).expect(200);
    // Changes nothing outside the books.
    const sale = await http().post("/sales").set(auth(accountantToken)).send({ storeId: stores[1], clientId: randomUUID(), lineItems: [], payments: [] });
    expect(sale.status).toBe(403);
    await http().post("/customers").set(auth(accountantToken)).send({ name: "Não" }).expect(403);
    await http().post("/employees").set(auth(accountantToken)).send({ firstName: "X", lastName: "Y" }).expect(403);
    await http().patch("/accounting/settings").set(auth(accountantToken)).send({ grouping: "PER_DOCUMENT" }).expect(200);
    // Inviting other accountants is the owner's.
    await http().get("/accounting/accountants").set(auth(accountantToken)).expect(403);
    // Their own professional number.
    expect((await http().patch("/accountant/profile").set(auth(accountantToken)).send({ ocpcaNumber: "OCPCA-9999" }).expect(200)).body).toEqual({ ocpcaNumber: "OCPCA-9999" });
    await http().patch("/accountant/profile").set(auth(owners[1])).send({ ocpcaNumber: "x" }).expect(403);
  });

  it("an invitation can be declined: it goes from both lists; invited again, the email's link accepts it signed out, once", async () => {
    accessEmail = undefined;
    await http().post("/accounting/accountants").set(auth(owners[2])).send({ email: accountantEmail, firstName: "Carla", lastName: "Contabilista" }).expect(201);
    const firstLink = accessEmail!.token;
    await http().post(`/accountant/invitations/${businesses[2]}/decline`).set(auth(accountantToken)).expect(200);
    expect((await http().get("/accounting/accountants").set(auth(owners[2])).expect(200)).body).toEqual([]);
    const clients = (await http().get("/accountant/clients").set(auth(accountantToken)).expect(200)).body as { businessId: string }[];
    expect(clients.some((c) => c.businessId === businesses[2])).toBe(false);
    expect(await prisma.auditLog.count({ where: { businessId: businesses[2], action: "ACCOUNTANT_DECLINED" } })).toBe(1);
    // A declined invitation's link no longer works.
    await http().post("/accountant/invitations/accept-link").send({ token: firstLink }).expect(400);

    accessEmail = undefined;
    await http().post("/accounting/accountants").set(auth(owners[2])).send({ email: accountantEmail, firstName: "Carla", lastName: "Contabilista" }).expect(201);
    expect(accessEmail!.token).not.toBe(firstLink);
    const accepted = (await http().post("/accountant/invitations/accept-link").send({ token: accessEmail!.token }).expect(200)).body;
    expect(accepted).toEqual({ accepted: true, email: accountantEmail, businessName: "Cliente Tres Lda" });
    await http().post("/accountant/invitations/accept-link").send({ token: accessEmail!.token }).expect(400);
    await http().post("/accountant/invitations/accept-link").send({ token: "not-a-real-token-at-all" }).expect(400);
    const switched = await http().post("/auth/switch-business").set(auth(accountantToken)).send({ businessId: businesses[2] }).expect(200);
    expect(switched.body.business.name).toBe("Cliente Tres Lda");
  });

  it("an accountant whose only company is a pending invitation is told to accept it before signing in", async () => {
    const email = `acc-only-invited-${RUN}@e2e.test`;
    inviteToken = undefined;
    await http().post("/accounting/accountants").set(auth(owners[2])).send({ email, firstName: "Rui", lastName: "Revisor" }).expect(201);
    await http().post("/auth/reset-password").send({ token: inviteToken, newPassword: PASSWORD }).expect(200);
    const userId = (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
    await http().delete(`/accounting/accountants/${userId}`).set(auth(owners[2])).expect(200);
    accessEmail = undefined;
    await http().post("/accounting/accountants").set(auth(owners[0])).send({ email, firstName: "Rui", lastName: "Revisor" }).expect(201);
    const login = await http().post("/auth/login").send({ email, password: PASSWORD }).expect(401);
    expect(login.body.message).toBe("Accept the invitation from your email first");
    await http().post("/accountant/invitations/accept-link").send({ token: accessEmail!.token }).expect(200);
    const after = await http().post("/auth/login").send({ email, password: PASSWORD }).expect(200);
    expect(after.body.user.businessId).toBe(businesses[0]);
  });

  it("the owner takes the access away: that company's session stops at once, the other company still works", async () => {
    const userId = (await prisma.user.findUniqueOrThrow({ where: { email: accountantEmail } })).id;
    await http().delete(`/accounting/accountants/${userId}`).set(auth(owners[1])).expect(200);
    const res = await http().get("/accounting/status").set(auth(accountantToken)).expect(401);
    expect(res.body.message).toBe("Your access to this company was removed");
    await http().post("/auth/refresh").set("Cookie", accountantCookie).expect(401);
    const login = await http().post("/auth/login").send({ email: accountantEmail, password: PASSWORD }).expect(200);
    expect(login.body.user.businessId).toBe(businesses[0]);
    expect(await prisma.auditLog.count({ where: { businessId: businesses[1], action: { in: ["ACCOUNTANT_INVITED", "ACCOUNTANT_REVOKED"] } } })).toBe(2);
  });
});
