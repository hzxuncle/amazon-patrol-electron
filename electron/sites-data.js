'use strict';

const BUILTIN_SITES = [
  { domain: 'amazon.com',    region: '北美', country: '美国',       zipLabel: 'ZIP Code',         zipExample: '10001',    zipFormat: '5位数字' },
  { domain: 'amazon.ca',     region: '北美', country: '加拿大',     zipLabel: 'Postal Code',      zipExample: 'K1A 0B1',  zipFormat: '字母数字混合 (A1A 1A1)' },
  { domain: 'amazon.co.uk',  region: '欧洲', country: '英国',       zipLabel: 'Postcode',         zipExample: 'SW1A 1AA', zipFormat: '字母数字混合' },
  { domain: 'amazon.de',     region: '欧洲', country: '德国',       zipLabel: 'Postleitzahl',     zipExample: '10115',    zipFormat: '5位数字' },
  { domain: 'amazon.fr',     region: '欧洲', country: '法国',       zipLabel: 'Code Postal',      zipExample: '75008',    zipFormat: '5位数字' },
  { domain: 'amazon.it',     region: '欧洲', country: '意大利',     zipLabel: 'CAP',              zipExample: '00100',    zipFormat: '5位数字' },
  { domain: 'amazon.es',     region: '欧洲', country: '西班牙',     zipLabel: 'Código Postal',    zipExample: '28001',    zipFormat: '5位数字' },
  { domain: 'amazon.nl',     region: '欧洲', country: '荷兰',       zipLabel: 'Postcode',         zipExample: '1012 AB',  zipFormat: '4位数字+2字母' },
  { domain: 'amazon.se',     region: '欧洲', country: '瑞典',       zipLabel: 'Postnummer',       zipExample: '111 22',   zipFormat: '5位数字' },
  { domain: 'amazon.pl',     region: '欧洲', country: '波兰',       zipLabel: 'Kod Pocztowy',     zipExample: '00-001',   zipFormat: '5位数字' },
  { domain: 'amazon.com.be', region: '欧洲', country: '比利时',     zipLabel: 'Code Postal',      zipExample: '1000',     zipFormat: '4位数字' },
  { domain: 'amazon.co.jp',  region: '亚太', country: '日本',       zipLabel: '郵便番号',          zipExample: '100-0001', zipFormat: '7位数字' },
  { domain: 'amazon.com.au', region: '亚太', country: '澳大利亚',   zipLabel: 'Postcode',         zipExample: '2000',     zipFormat: '4位数字' },
  { domain: 'amazon.in',     region: '亚太', country: '印度',       zipLabel: 'PIN Code',         zipExample: '110001',   zipFormat: '6位数字' },
  { domain: 'amazon.sg',     region: '亚太', country: '新加坡',     zipLabel: 'Postal Code',      zipExample: '238859',   zipFormat: '6位数字' },
  { domain: 'amazon.com.mx', region: '拉美', country: '墨西哥',     zipLabel: 'Código Postal',    zipExample: '01000',    zipFormat: '5位数字' },
  { domain: 'amazon.com.br', region: '拉美', country: '巴西',       zipLabel: 'CEP',              zipExample: '01001-000',zipFormat: '8位数字' },
  { domain: 'amazon.ae',     region: '中东', country: '阿联酋',     zipLabel: 'Postal Code',      zipExample: '00000',    zipFormat: '5位数字(可选)' },
  { domain: 'amazon.sa',     region: '中东', country: '沙特阿拉伯', zipLabel: 'Postal Code',      zipExample: '11564',    zipFormat: '5位数字' },
  { domain: 'amazon.com.tr', region: '中东', country: '土耳其',     zipLabel: 'Posta Kodu',       zipExample: '34400',    zipFormat: '5位数字' },
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
