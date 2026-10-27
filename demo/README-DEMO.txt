POS DEMO - run the whole POS on this laptop
===========================================

Everything runs on this laptop. No internet or hosting is needed after the
first install.

WHAT IS IN THIS FOLDER
  start-demo.bat        starts the POS server
  stop-demo.bat         stops it
  POS-Setup-0.2.6.exe   the POS app (installer)
  docker-compose.yml    server settings (no need to touch it)
  images\               the server itself (loaded into Docker the first time)


1. INSTALL DOCKER DESKTOP (once)
   - Download it from https://www.docker.com/products/docker-desktop/
   - Install it with the default options, then restart the laptop if asked.
   - Open Docker Desktop once and accept its terms. You can skip signing in.

2. START THE SERVER
   - Unzip this folder somewhere, for example on the Desktop.
   - Double-click start-demo.bat.
   - The first time takes a few minutes. Wait until it says
     "The POS server is running".

3. INSTALL THE POS APP (once)
   - Double-click POS-Setup-0.2.6.exe.
   - If Windows says "Windows protected your PC", click "More info",
     then "Run anyway".

4. CONNECT THE APP TO THE SERVER
   - Open the POS app. It asks for the server address. Type:

         http://localhost:4000

5. SIGN IN
   Owner (back office, all settings):
       email:     owner@demo-store.test
       password:  OwnerPass123!
       till PIN:  8642

   Cashier (till):
       email:     cashier@demo-store.test
       password:  CashierPass123!
       till PIN:  2468

   The demo store is "Demo Retail Co." in Angola, with prices in Kwanza
   and IVA at 14%.


EVERY DAY
  - The server keeps running in the background, even after a restart, as
    long as Docker Desktop is open. If the app cannot reach the server,
    run start-demo.bat again.
  - To stop the server: double-click stop-demo.bat. Your demo data is kept.


UPDATING TO A NEW VERSION (your demo data is kept)
  1. Double-click stop-demo.bat in your current POS demo folder.
  2. Unzip the new POS-Demo.zip OVER that same folder, and choose
     "Replace the files". Use the same folder: it holds the server's
     password (.env), and a new folder would not open your data.
  3. Double-click start-demo.bat. It loads the new server and updates
     the database. Wait until it says "The POS server is running".
  4. Install the new POS-Setup exe from the folder (the app updates;
     its settings are kept).

START OVER WITH A FRESH DEMO STORE
  Open a Command Prompt in this folder and run:   stop-demo.bat reset
  Type YES. Then run start-demo.bat again.


IF SOMETHING GOES WRONG
  - "Docker is not installed": do step 1.
  - "port is already allocated" / "4000": another program uses port 4000.
    Close it, or restart the laptop, and run start-demo.bat again.
  - The app says it cannot reach the server: run start-demo.bat and check
    that it ends with "The POS server is running".
