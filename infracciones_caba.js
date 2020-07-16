#!/usr/bin/node


const puppeteer = require('puppeteer')
const fs = require('fs')
const retry = require('async-retry')
const nodemailer = require('nodemailer')
const dateObj = new Date()
const actualMonth = dateObj.getUTCMonth() + 1
let actualDay = dateObj.getUTCDate() 
const actualYear = dateObj.getUTCFullYear()
const antiCaptchaCreds = require('./files/anti_captcha.json')
const anticaptcha = require('./anti-captcha/anticaptcha')(antiCaptchaCreds.token)

const URL_CONSULTA_INFRACCIONES = 'https://www.buenosaires.gob.ar/consulta-de-infracciones'

const processParams = {
    codigoPatente: process.argv[2],
    email_addresses: process.argv[3],
    email_password: process.argv[4],
    email_toSend: process.argv[5]

}


const checkPatent = async() =>{
        try{
            let codigoPatente = processParams.codigoPatente
            codigoPatente = codigoPatente.replace(/\s+/g, '')
           // console.log(codigoPatente)
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

const getEmailTransporter = () => {
    const EMAIL_HOST = 'smtp.gmail.com'
    const SMTP_EMAIL_USER = processParams.email_addresses
    const SMTP_EMAIL_PASSWORD = processParams.email_password

    var transporter = nodemailer.createTransport({
        host: EMAIL_HOST,
        port: '587',
        auth: {
            user: SMTP_EMAIL_USER,
            pass: SMTP_EMAIL_PASSWORD
        },
        secureConnection: false,
        tls: {
            ciphers: 'SSLv3'
        },
        requireTLS: true
    });

    return transporter
}

const sendResultConciliacionEmail = async (codigoPatente) => {
    return new Promise(async (resolve, reject) => {
        try {
            let transporter = getEmailTransporter()
           

            //const attachmentsReport = await readReportFiles(resultAttachments)

            let htmlFinal = '<h3>Tenemos resultados sobre su patente.</h3>'
            htmlFinal += '<p>Se adjunta imagen con los resultados obtenidos en el sitio de Consulta de Infracciones en CABA.</p>'
            htmlFinal += '<p>Hasta la próxima!</p><p>THE EYE BOT</p>'
            let viewPatent = codigoPatente
            //console.log(viewPatent)
            // setup e-mail data with unicode symbols
            const NO_REPLY_ADDRESS = 'support@theeye.io'
            var mailOptions = {
                from: NO_REPLY_ADDRESS,
                to: processParams.email_toSend,
                 //cc: 'guidoher@theeye.io',
                subject: 'TheEye - Infracciones Bot - PROCESO FINALIZADO',
                html: htmlFinal,
                attachments: [{
                    filename: viewPatent+'screenshot.png',
                    path: __dirname+'//download//'+viewPatent+'screenshot.png'
                },
                {
                    filename: 'Patente-'+viewPatent+'.json',
                    path: __dirname+'//'+'Patente-'+viewPatent+'.json'
                }]
            }

            resolve(true)

            // send mail with defined transport object
            transporter.sendMail(mailOptions, function (err, info) {
                if (err) {
                    console.log(err);
                    reject(err)
                    logErrorAndExit()
                } else {
                    console.log('email enviado');
                    resolve(true)
                    logSuccessAndExit()
                }
            });
        } catch (err) {
            console.log(err)
            reject(err)
        }
    })
}





const procesarReCaptcha = async () => {
    return new Promise(async function(resolve, reject) {
        // Procesamos el re captcha
        console.log('***anticaptcha')
        anticaptcha.setWebsiteURL(URL_CONSULTA_INFRACCIONES)
        anticaptcha.setWebsiteKey("6Lc7ghEUAAAAAH9fu3estiLfVWZrU0uaWeIplQ2q")

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

                            await page.waitForSelector('#edit-submit')
                            await page.click('#edit-submit')
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


const dataOutput = async (codigoPatente) => {
    return new Promise(async function(resolve, reject) {
        try {
            let datosExtraidosDeActa = []
            let patenteVehicular = codigoPatente

            await page.waitFor(5000)
            if (await page.$("#block-system-main > div > div.container > div.panel-pane.pane-block.pane-gcaba-infracciones-gcaba-infracciones > div > div > div > div.libreDeuda-view.mt-2 > p") !== null){
                await page.screenshot({path: __dirname+"/download/"+patenteVehicular+'screenshot.png',fullPage: true })

                let sinInfracciones = "La patente "+patenteVehicular+" no posee ninguna infraccion"
                const resultado_extraido = JSON.stringify({
                    "Patente del Vehiculo": patenteVehicular,
                    "Resultado Extraido" : sinInfracciones
                })
                datosExtraidosDeActa.push(resultado_extraido)
                fs.appendFileSync('Patente-'+patenteVehicular+'.json',datosExtraidosDeActa)
                resolve(true)
                sendResultConciliacionEmail(codigoPatente)
            }

            await page.waitForSelector('#tipo-consulta')

            let cantidadDeActas = (await page.$$('#accordion > div > div.panel-heading > h4 > a')).length 
            await page.waitForSelector('#accordion > div:nth-child(2) > div.panel-heading > h4 > a')

            let filaDeActa = 0
            
            await page.screenshot({path: __dirname+"/download/"+patenteVehicular+'screenshot.png',fullPage: true })


            for(filaDeActa = 0; filaDeActa < cantidadDeActas; filaDeActa++){    
                await page.waitFor(5000)
                const seleccionDeActa = await page.$$('#accordion > div > div.panel-heading > h4 > a');
                await seleccionDeActa[filaDeActa].click();
                let columnaDeActa = await page.$$('#accordion > div > div.panel-heading > h4 > a')
                let idDelActa = await page.evaluate(columnaDeActa => columnaDeActa.hash, columnaDeActa[filaDeActa])
                let selectorDatosdelActa = idDelActa+'> div > div > div > p'
                selectorDatosdelActa = selectorDatosdelActa.toString()
                let datosDelActa = await page.$$(selectorDatosdelActa)

                let verificacionDeDescuento = await page.evaluate(datosDelActa => datosDelActa.innerText, datosDelActa[0])
                let fechaHorarioEmision = await page.evaluate(datosDelActa => datosDelActa.innerText, datosDelActa[1])
                let infraccion = await page.evaluate(datosDelActa => datosDelActa.innerText, datosDelActa[3])
                let puntos = await page.evaluate(datosDelActa => datosDelActa.innerText, datosDelActa[5])
                let descripcion = await page.evaluate(datosDelActa => datosDelActa.innerText, datosDelActa[7])

                if(verificacionDeDescuento.includes('Descuento válido hasta:')){
                    fechaHorarioEmision = await page.evaluate(datosDelActa => datosDelActa.innerText, datosDelActa[3])
                    infraccion = await page.evaluate(datosDelActa => datosDelActa.innerText, datosDelActa[5])
                    puntos = await page.evaluate(datosDelActa => datosDelActa.innerText, datosDelActa[7])
                    descripcion = await page.evaluate(datosDelActa => datosDelActa.innerText, datosDelActa[9]) 
                }

                const resultado_extraido = JSON.stringify({
                    "Patente del Vehiculo": patenteVehicular,
                    "Fecha y hora de Emision": fechaHorarioEmision,
                    "Infraccion": infraccion,
                    "puntos":puntos,
                    "descripcion": descripcion
                })
                datosExtraidosDeActa.push(resultado_extraido)

               // console.log(datosExtraidosDeActa)
               // console.log('--------------------------------------')
            }

            fs.appendFileSync('Patente-'+patenteVehicular+'.json',datosExtraidosDeActa)          
            resolve(true)
            sendResultConciliacionEmail(codigoPatente)

        } catch (err) {
            console.log(err)
            reject(err)
        }
    })
}


 

const processDataRequest = async (codigoPatente) => {
    return new Promise(async function(resolve, reject) {
           try {

            await page.waitForSelector('#edit-dominio')
            await page.click('#edit-dominio')

            await page.type('#edit-dominio',codigoPatente)

            const captchaSolved = await procesarReCaptcha()
            if (captchaSolved) {
                await dataOutput(codigoPatente)
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
         headless: true,
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
    //console.log(processParams)
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
        state: 'success',
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