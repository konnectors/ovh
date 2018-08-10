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
  const billsDecorated = await parseAndDecorateBills(ovh, bills)

  log('info', 'Saving data to Cozy...')
  await saveBills(billsDecorated, fields.folderPath, {
    identifiers: ['OVH'],
    contentType: 'application/pdf'
  })
}

async function getBillsListAndTestTokens(ovh) {
  let bills = []
  try {
    bills = await ovh.requestPromised('GET', '/me/bill')
  } catch (e) {
    if (e.error && e.error == 403 && e.message &&
        (e.message == 'This application key is invalid'
         || e.message == 'This credential does not exist')) {
      log('error', e)
      throw new Error(errors.LOGIN_FAILED)
    } else if (
      e.error &&
      e.error == 400 &&
      e.message &&
      e.message == 'Invalid signature'
    ) {
      log('error', e)
      log('error', 'The AppSecret seems not valid')
      throw new Error(errors.LOGIN_FAILED)
    } else if (e.error && e.error == 403 && e.message
               && e.message == 'This call has not been granted') {
      log('error', e)
      log('error', 'Auth ok, but GET /me/bill have not been granted')
      throw new Error(errors.LOGIN_FAILED)
    } else {
      throw e
    }
  }

  log('info', `Found a list of ${bills.length} bills`)
  log('debug', bills)
  return bills
}

async function parseAndDecorateBills(ovh, bills) {
  const billsDec = []
  for (let bill of bills) {
    let details = []
    try {
      details = await ovh.requestPromised('GET', `/me/bill/${bill}`)
    } catch(e) {
      if (e.error && e.error == 403 && e.message
          && e.message == 'This call has not been granted') {
        log('error', e)
        log('error', 'Auth ok, but GET /me/bill/* have not been granted')
        throw new Error(errors.LOGIN_FAILED)
      } else {
        throw e
      }
    }
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
