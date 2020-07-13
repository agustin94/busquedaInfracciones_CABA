#!/usr/bin/node


const puppeteer = require('puppeteer')
const fs = require('fs')
const retry = require('async-retry')
const dateObj = new Date()
const actualMonth = dateObj.getUTCMonth() + 1
let actualDay = dateObj.getUTCDate() 
const actualYear = dateObj.getUTCFullYear()
const antiCaptchaCreds = require('./files/anti_captcha.json')
const anticaptcha = require('./anti-captcha/anticaptcha')(antiCaptchaCreds.token)

const URL_CONSULTA_INFRACCIONES = 'https://www.buenosaires.gob.ar/consulta-de-infracciones'

const processParams = {
    codigoPatente: process.argv[2]
}


const checkPatent = async() =>{
        try{
            console.log(processParams.codigoPatente)
            let codigoPatente = processParams.codigoPatente
            codigoPatente = codigoPatente.trim()
            console.log(codigoPatente)
             browser.close()
        await retry(async bail => {
            await processDataRequest(codigoPatente)
        })

        }catch(err){
            console.log("Fallo")
            console.log(err)
            logErrorAndExit(true)
            throw new Error(err)
        }
}

const procesarReCaptcha = async () => {
    return new Promise(async function(resolve, reject) {
        // Procesamos el re captcha
        console.log('***anticaptcha')
        anticaptcha.setWebsiteURL(URL_CONSULTA_INFRACCIONES)
        anticaptcha.setWebsiteKey("6LdwS08UAAAAALS3Vi6zEITCELwuodHhOQLt8lVv")

        // Nos aseguramos de que existan: 
        // * El input donde pegamos el token final
        // * El iFrame con el input donde pegamos el token final 
        await page.waitForSelector('#g-recaptcha-response')
        await page.evaluate(() => {
            document.querySelector('#g-recaptcha-response').style = ''
        })

        anticaptcha.getBalance(async function(err, balance) {
            if (err) {
                reject(err)
            }

            if (balance > 0) {
                anticaptcha.createTaskProxyless(async function(err, taskId) {
                    // anticaptcha.createRecaptchaV3TaskProxyless(async function(err, taskId) {
                    if (err) {
                        reject(err.message)
                    }

                    anticaptcha.getTaskSolution(taskId, async function(err, taskSolution) {
                        if (err) {
                            console.log(err)
                            reject(err)
                        }

                        try {
                            console.log('Paso el captcha!')
                            console.log('anticaptcha-taskSolution:', taskSolution)

                            // Actualizamos Recaptcha TextArea
                            await page.type('#g-recaptcha-response', taskSolution)

                            await page.waitForSelector('button.btn.btn-primary.btn-sm')
                            await page.click('button.btn.btn-primary.btn-sm')
                            // Actualizamos Recaptcha Input que esta adentro del iframe del Recaptcha.
                            // Esto lo tenemos que hacer porque viene con un response token x default y si no lo actualizamos con el token que generó
                            // el resultado de anti-captcha, lo pasa como invalido

                           // await page.waitForSelector('table.table.table-BCRA.table-bordered.table-responsive')
                           //let texto = await page.$('table.table.table-BCRA.table-bordered.table-responsive').innerText
                           //console.log(texto)
                           resolve(true)

                        } catch (err) {
                            console.log(err)
                            reject(err)
                        }
                    })
                })
            } else {
                reject('balance no suficiente')
            }
        })
    })
}


const dataOutput = async () => {
    return new Promise(async function(resolve, reject) {
        try {
            await page.waitForSelector('#aimprimir > div')

            let verificacion = await page.$eval('#aimprimir > div', e => e.innerText)
            if (verificacion.includes('No existen deudas registradas para el CUIT-CUIL-CDI')){
                console.log('No existen deudas registradas para el CUIT-CUIL-CDI '+processParams.codigoPatente)
                process.exit()
            }
            
            await page.waitForSelector('div.right-arrow.pull-right')
            await page.click('div.right-arrow.pull-right')

            await page.waitForSelector('#\\31  > div > table')
            let o24meses = await page.$eval('#\\31  > div > table > tbody > tr', e => e.innerText)
            o24meses = JSON.stringify(o24meses)
            const array24meses = o24meses.split('\\t')
            console.log(array24meses[1])

            let allData = await page.$eval('#aimprimir > table.table.table-BCRA.table-bordered.table-responsive > tbody', e => e.innerText)
            const convertStringify = JSON.stringify(allData)
            console.log(convertStringify)
            const separateFila = convertStringify.split('\\t')
            const putJSONData = JSON.stringify({
                "Denominacion del deudor":separateFila[0],
                "Entidad":separateFila[1],
                "Periodo":separateFila[2],
                "Situacion":separateFila[3],
                "Monto":separateFila[4],
                "Días de atraso":separateFila[5],
                "Observaciones":separateFila[6]

            })
            const putJSONHistorial = JSON.stringify({
                "Historial 24 meses":{
                    "Periodo":array24meses[0],
                    "Situacion":array24meses[1],
                    "Monto":array24meses[2],
                    "proceso judicial/Revision":array24meses[3]
                },
            })
            
            fs.appendFileSync("situacion_crediticia"+processParams.codigoPatente+'.json', putJSONData,putJSONHistorial)
            console.log(putJSONData)
                browser.close()
                process.exit()
        } catch (err) {
            console.log(err)
            reject(err)
        }
    })
}
 

const processDataRequest = async (codigoPatente) => {
    return new Promise(async function(resolve, reject) {
           try {

            await page.waitForSelector('input.form-control')
            await page.click('input.form-control')

            await page.type('input.form-control',codigoPatente)

            const captchaSolved = await procesarReCaptcha()
            if (captchaSolved) {
                await dataOutput()
            } else {
                reject('Error solving captcha')
                browser.close()
            }

            

        
           /* try {
                const result = await dataOutput()
                resolve(result)
            } catch (err) {
                reject(err.message)
            }*/
            
            }catch(err){
            //browser.close()
                console.log("Fallo")
                console.log(err)
                logErrorAndExit(true)
                throw new Error(err)
                
            }

                    
    })
}

const preparePage = async () => {
    browser = await puppeteer.launch({
         headless: false,
        //headless: true,
        args: [
            '--no-sandbox',
            '--disable-features=site-per-process',
            '--disable-gpu',
            '--window-size=1920x1080',
        ]
    })
    viewPort = {
        width: 1300,
        height: 900
    }

    page = await browser.newPage()
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.109 Safari/537.36');
    await page.setViewport(viewPort)
    await page.setDefaultNavigationTimeout(20000)
    await page.setDefaultTimeout(20000)

    await page.goto(URL_CONSULTA_INFRACCIONES, {
        waitUntil: 'networkidle0'
    })

}

const run = async () => {
    console.log(processParams)
    // preparo el navegador e ingreso al sistema
    await retry(async bail => {
        // if anything throws, we retry
        await preparePage()
    }, {
        retries: 5,
        onRetry: async err => {
            console.log(err)
            console.log('Retrying...')
            await page.close()
            await browser.close()
        }
    })

    try {
        console.log('primer try...')
        const processResult = await checkPatent()
        logSuccessAndExit(processResult)
    } catch (err) {
        console.log(err)
        throw new Error(err)
    }
}

const logErrorAndExit = async error => {
    //const resultChangeStatus = await updateJobResult(processParams.job_id, 'error', null, error)
    console.log(JSON.stringify({
        state: 'failure',
     /* job_id: processParams.job_id,
        job_type: processParams.job_type,
        job_status: 'error',
        job_data: null,
        job_error: error*/

    }))

    process.exit()
}

const logSuccessAndExit = async resultData => {
    //const resultChangeStatus = await updateJobResult(processParams.job_id, 'finished', resultData, null)
    console.log(JSON.stringify({
        state: 'normal',
            /*data: {
            job_id: processParams.job_id,
            job_type: processParams.job_type,
            job_status: 'finished',
            job_data: resultData,
            job_error: null
        }*/

    }))

    process.exit()
}
run().catch(logErrorAndExit)