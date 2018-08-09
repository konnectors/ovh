const { BaseKonnector, saveBills, log } = require('cozy-konnector-libs')

module.exports = new BaseKonnector(start)

async function start(fields) {
  log('info', 'Testing authentification tokens...')
  const ovh = require('ovh')({
    appKey: fields.appKey,
    appSecret: fields.appSecret,
    consumerKey: fields.consumerKey
  })
  // Really test token

  log('info', 'Getting bills ...')
  const bills = await getBills(ovh)
  const billsDecorated = await parseAndDecorateBills(ovh, bills)

  log('info', 'Saving data to Cozy...')
  await saveBills(billsDecorated, fields.folderPath, {
    identifiers: ['OVH'],
    contentType: 'application/pdf'
  })
}

async function getBills(ovh) {
  const bills = await ovh.requestPromised('GET', '/me/bill')
  log('info', `Found a list of ${bills.length} bills`)
  log('debug', bills)
  return bills
}

async function parseAndDecorateBills(ovh, bills) {
  const billsDec = []
  for (let bill of bills) {
    const details = await ovh.requestPromised('GET', `/me/bill/${bill}`)
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
