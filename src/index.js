process.env.SENTRY_DSN =
  process.env.SENTRY_DSN ||
  'https://9ba275488abd408ebd7dbd017e7994b7:a3e6a4bd7d904bf890ecaf602ecfbf73@sentry.cozycloud.cc/89'

const { BaseKonnector, saveBills, log, errors } = require('cozy-konnector-libs')

module.exports = new BaseKonnector(start)

async function start(fields) {
  log('info', 'Testing authentification tokens...')
  const ovh = require('ovh')({
    appKey: fields.appKey,
    appSecret: fields.appSecret,
    consumerKey: fields.consumerKey
  })
  log('info', 'Getting bills and test tokens...')
  const bills = await getBillsListAndTestTokens(ovh)
  log('info', `Found a list of ${bills.length} bills`)
  log('debug', bills)
  const billsDecorated = await parseAndDecorateBills(ovh, bills)

  log('info', 'Saving data to Cozy...')
  await saveBills(billsDecorated, fields.folderPath, {
    identifiers: ['OVH'],
    contentType: 'application/pdf'
  })
}

async function getBillsListAndTestTokens(ovh) {
  return await ovh.requestPromised('GET', '/me/bill').catch(function(e) {
    if (e.error == undefined || e.message == undefined) {
      throw e
    } else {
      if (
        e.error == 403 && (
          e.message == 'This application key is invalid' ||
            e.message == 'This credential does not exist')) {
        log('error', e)
        throw new Error(errors.LOGIN_FAILED)
      } else if (
        e.error == 400 &&
          e.message == 'Invalid signature'
      ) {
        log('error', e)
        log('error', 'The AppSecret seems not valid')
          throw new Error(errors.LOGIN_FAILED)
      } else if (
        e.error == 403 &&
          e.message == 'This call has not been granted'
      ) {
        log('error', e)
        log('error', 'Auth ok, but GET /me/bill have not been granted')
        throw new Error(errors.LOGIN_FAILED)
      } else if (
          e.error == 403 &&
          e.message == 'This credential is not valid'
      ) {
        log('error', e)
        log('error', 'The tokens seems to have expired')
        throw new Error(errors.LOGIN_FAILED)
      } else {
        throw e
      }
      }
  })
}

async function getBillDetails(ovh, billId) {
  return await ovh.requestPromised('GET', `/me/bill/${billId}`).catch(function(e) {
    if (
      e.error &&
        e.error == 403 &&
        e.message &&
        e.message == 'This call has not been granted'
    ) {
      log('error', e)
      log('error', 'Auth ok, but GET /me/bill/* have not been granted')
      throw new Error(errors.LOGIN_FAILED)
    } else {
      throw e
    }
  })
}



async function parseAndDecorateBills(ovh, bills) {
  const billsDec = []
  for (let bill of bills) {
    const details = await getBillDetails(ovh, bill)
    const dateObject = new Date(details.date)
    const billDec = {
      vendor: 'Ovh',
      date: dateObject,
      amount: details.priceWithTax.value,
      currency: details.priceWithTax.currencyCode,
      fileurl: details.pdfUrl,
      filename:
        `${dateObject.toISOString().substring(0, 10)}` +
        `_${details.priceWithTax.text.replace(' ', '')}` +
        `_${details.billId}.pdf`
    }
    log('debug', billDec)
    billsDec.push(billDec)
  }
  return billsDec
}
