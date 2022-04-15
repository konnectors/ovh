process.env.SENTRY_DSN =
  process.env.SENTRY_DSN ||
  'https://a016e2fec4f542878faac2a7762410d4@errors.cozycloud.cc/40'

const { BaseKonnector, log, errors, cozyClient } = require('cozy-konnector-libs')

const models = cozyClient.new.models
const { Qualification } = models.document

module.exports = new BaseKonnector(start)

async function start(fields) {
  log('info', 'Testing authentification tokens...')
  const ovh = require('ovh')({
    endpoint: fields.provider ? fields.provider : 'ovh-eu',
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
  await this.saveBills(billsDecorated, fields.folderPath, {
    identifiers: ['OVH', 'Kimsufi'], // FIXME This is working for OVH and Kimsufi, no idea for the other providers
    contentType: 'application/pdf',
    sourceAccountIdentifier: fields.appKey,
    keys: ['vendorRef'],
    fileIdAttributes: ['vendorRef']
  })
}

async function getBillsListAndTestTokens(ovh) {
  return await ovh.requestPromised('GET', '/me/bill').catch(function (e) {
    if (e.error == undefined || e.message == undefined) {
      throw e
    } else {
      log('error', e)
      if (
        e.error == 403 &&
        (e.message == 'This application key is invalid' ||
          e.message == 'This credential does not exist')
      ) {
        throw new Error(errors.LOGIN_FAILED)
      } else if (e.error == 400 && e.message == 'Invalid signature') {
        log('error', 'The AppSecret seems not valid')
        throw new Error(errors.LOGIN_FAILED)
      } else if (
        e.error == 403 &&
        e.message == 'This call has not been granted'
      ) {
        log('error', 'Auth ok, but GET /me/bill have not been granted')
        throw new Error(errors.LOGIN_FAILED)
      } else if (
        e.error == 403 &&
        e.message == 'This credential is not valid'
      ) {
        log('error', 'The tokens seems to have expired')
        throw new Error(errors.LOGIN_FAILED)
      } else {
        throw e
      }
    }
  })
}

async function getBillDetails(ovh, billId) {
  return await ovh
    .requestPromised('GET', `/me/bill/${billId}`)
    .catch(function (e) {
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
      vendorRef: details.billId,
      fileurl: details.pdfUrl,
      filename:
        `${dateObject.toISOString().substring(0, 10)}` +
        `_${details.priceWithTax.text.replace(' ', '')}` +
        `_${details.billId}.pdf`,
      fileAttributes: {
        metadata: {
          contentAuthor: 'ovh.com',
          issueDate: new Date(),
          datetime: dateObject,
          datetimeLabel: `issueDate`,
          isSubscription: true,
          carbonCopy: true,
          qualification: Qualification.getByLabel('web_service_invoice')
        }
      }
    }
    billsDec.push(billDec)
  }
  return billsDec
}
