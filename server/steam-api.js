'use strict';
class SteamApiError extends Error {
  constructor(code) { super('Steam could not complete this request. Please try again.'); this.name = 'SteamApiError'; this.code = Number(code) || 0; }
}
class SteamApi {
  constructor(key, environment, transport = fetch) { this.key = key; this.transport = transport; this.micro = environment === 'live' ? 'ISteamMicroTxn' : 'ISteamMicroTxnSandbox'; }
  async request(service, method, version, values, post = false) {
    const params = new URLSearchParams({ key: this.key, ...values });
    const url = 'https://partner.steam-api.com/' + service + '/' + method + '/v' + version + '/';
    let body;
    try {
      const response = await this.transport(post ? url : url + '?' + params, {
        method: post ? 'POST' : 'GET', signal: AbortSignal.timeout(15000),
        ...(post ? { body: params, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } } : {}),
      });
      if (!response.ok) throw new SteamApiError(response.status);
      const json = await response.json();
      body = json.response || json;
    } catch (error) {
      // Never surface fetch errors containing authenticated URLs or credentials.
      throw new SteamApiError(error instanceof SteamApiError ? error.code : 0);
    }
    if (!body || body.error || body.result === 'Failure') throw new SteamApiError(body?.error?.errorcode);
    return body;
  }
  async authenticate(ticket) {
    return (await this.request('ISteamUserAuth', 'AuthenticateUserTicket', 1,
      { appid: 5043620, ticket, identity: 'simple-wars-store' })).params;
  }
  async ownership(steamId, appid) {
    const response = await this.request('ISteamUser', 'CheckAppOwnership', 4, { steamid: steamId, appid });
    return response.appownership;
  }
  async microRequest(method, version, values, post = false) {
    return (await this.request(this.micro, method, version, { appid: 5043620, ...values }, post)).params;
  }
}
module.exports = { SteamApi, SteamApiError };
