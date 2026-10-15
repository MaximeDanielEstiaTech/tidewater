I want you to create an MCP server for WorkTimePro allowing you connect to the WorkTimePro website using puppeteer. 
When I ask you to fill out a new month:
1. you navigate to the WorkTimePro website at https://netestia.sharepoint.com/sites/appcatalog/ClientSideAssets/211c67c8-63f5-40f9-b458-d6b646096974/index.aspx?SPHostUrl=https%3A%2F%2Fnetestia.sharepoint.com%2Fsites%2FWorkTimePro%2FAPP&CatalogUrl=https%3A%2F%2Fnetestia.sharepoint.com%2Fsites%2Fappcatalog#!/timesheets/my
2. you create a new "Feuille de temps" (timesheet) for that month.
3. you select the "Informations générales" tab and select the right "<month> <year>".
3. you select the "Details de la feuille de temps" tab and fill out the timesheet:
    - for every working day of the month (Monday to Friday), you fill in the hours worked (7.33 hours max).
    - the final amount of hours worked for the month should be distributed evenly across four 'Projet/Tâche' (Project/Task) entries:
        - CYCLE INGENIEUR (CI) > 1ère année
        - CYCLE INGENIEUR (CI) > 2ème année
        - PANDRONE - ETECH/PANDRO > -
        - RECHERCHE SUR FONDS PROPRES > -
4. you save the timesheet.
5. You prompt me to confirm that the timesheet has been filled out correctly and ask if I want to submit it. 
    - For testing, don't really submit it! Just prepare the mcp feature and its scripts to click on "Soumettre" (Submit) button, but do not execute the submission until I confirm.