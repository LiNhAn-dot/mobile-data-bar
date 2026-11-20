const assert = require('node:assert/strict');
const test = require('node:test');
const { hasSignInChallenge } = require('../src/page-reader.cjs');

test('a redirect through the login domain does not itself show a verification challenge', () => {
  assert.equal(hasSignInChallenge({ body: { innerText: '正在登录，请稍候' } }), false);
});

test('visible QR and verification forms require the user', () => {
  for (const innerText of ['用户登录\n扫码登录\n打开中国移动客户端', '请输入短信验证码']) {
    assert.equal(hasSignInChallenge({ body: { innerText } }), true);
  }
});
