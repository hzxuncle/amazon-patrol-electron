'use strict';

const BUILTIN_SITES = [
  { domain: 'amazon.com',    code: 'US', region: '北美', country: '美国',       currency: 'USD', zipLabel: 'ZIP Code',         zipExample: '10001',    zipFormat: '5位数字' },
  { domain: 'amazon.ca',     code: 'CA', region: '北美', country: '加拿大',     currency: 'USD', zipLabel: 'Postal Code',      zipExample: 'K1A 0B1',  zipFormat: '字母数字混合 (A1A 1A1)' },
  { domain: 'amazon.co.uk',  code: 'UK', region: '欧洲', country: '英国',       currency: 'GBP', zipLabel: 'Postcode',         zipExample: 'SW1A 1AA', zipFormat: '字母数字混合' },
  { domain: 'amazon.de',     code: 'DE', region: '欧洲', country: '德国',       currency: 'EUR', zipLabel: 'Postleitzahl',     zipExample: '10115',    zipFormat: '5位数字' },
  { domain: 'amazon.fr',     code: 'FR', region: '欧洲', country: '法国',       currency: 'EUR', zipLabel: 'Code Postal',      zipExample: '75008',    zipFormat: '5位数字' },
  { domain: 'amazon.it',     code: 'IT', region: '欧洲', country: '意大利',     currency: 'EUR', zipLabel: 'CAP',              zipExample: '00100',    zipFormat: '5位数字' },
  { domain: 'amazon.es',     code: 'ES', region: '欧洲', country: '西班牙',     currency: 'EUR', zipLabel: 'Código Postal',    zipExample: '28001',    zipFormat: '5位数字' },
  { domain: 'amazon.nl',     code: 'NL', region: '欧洲', country: '荷兰',       currency: 'USD', zipLabel: 'Postcode',         zipExample: '1012 AB',  zipFormat: '4位数字+2字母' },
  { domain: 'amazon.se',     code: 'SE', region: '欧洲', country: '瑞典',       currency: 'USD', zipLabel: 'Postnummer',       zipExample: '111 22',   zipFormat: '5位数字' },
  { domain: 'amazon.pl',     code: 'PL', region: '欧洲', country: '波兰',       currency: 'USD', zipLabel: 'Kod Pocztowy',     zipExample: '00-001',   zipFormat: '5位数字' },
  { domain: 'amazon.com.be', code: 'BE', region: '欧洲', country: '比利时',     currency: 'USD', zipLabel: 'Code Postal',      zipExample: '1000',     zipFormat: '4位数字' },
  { domain: 'amazon.co.jp',  code: 'JP', region: '亚太', country: '日本',       currency: 'USD', zipLabel: '郵便番号',          zipExample: '100-0001', zipFormat: '7位数字' },
  { domain: 'amazon.com.au', code: 'AU', region: '亚太', country: '澳大利亚',   currency: 'USD', zipLabel: 'Postcode',         zipExample: '2000',     zipFormat: '4位数字' },
  { domain: 'amazon.in',     code: 'IN', region: '亚太', country: '印度',       currency: 'USD', zipLabel: 'PIN Code',         zipExample: '110001',   zipFormat: '6位数字' },
  { domain: 'amazon.sg',     code: 'SG', region: '亚太', country: '新加坡',     currency: 'USD', zipLabel: 'Postal Code',      zipExample: '238859',   zipFormat: '6位数字' },
  { domain: 'amazon.com.mx', code: 'MX', region: '拉美', country: '墨西哥',     currency: 'USD', zipLabel: 'Código Postal',    zipExample: '01000',    zipFormat: '5位数字' },
  { domain: 'amazon.com.br', code: 'BR', region: '拉美', country: '巴西',       currency: 'USD', zipLabel: 'CEP',              zipExample: '01001-000',zipFormat: '8位数字' },
  { domain: 'amazon.ae',     code: 'AE', region: '中东', country: '阿联酋',     currency: 'USD', zipLabel: 'Postal Code',      zipExample: '00000',    zipFormat: '5位数字(可选)' },
  { domain: 'amazon.sa',     code: 'SA', region: '中东', country: '沙特阿拉伯', currency: 'USD', zipLabel: 'Postal Code',      zipExample: '11564',    zipFormat: '5位数字' },
  { domain: 'amazon.com.tr', code: 'TR', region: '中东', country: '土耳其',     currency: 'USD', zipLabel: 'Posta Kodu',       zipExample: '34400',    zipFormat: '5位数字' },
];

// 默认启用的站点
const DEFAULT_ENABLED = new Set([
  'amazon.com', 'amazon.ca', 'amazon.com.au', 'amazon.com.mx'
]);

function buildDefaultSites() {
  return BUILTIN_SITES.map(s => ({
    ...s,
    zip: s.zipExample,
    enabled: DEFAULT_ENABLED.has(s.domain),
  }));
}

module.exports = { BUILTIN_SITES, buildDefaultSites };
