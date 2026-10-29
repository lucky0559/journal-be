import { LegalController } from './legal.controller';

describe('LegalController', () => {
  const legal = new LegalController();

  it('serves a privacy policy that names the data, the processors and a contact', () => {
    const html = legal.privacy();
    expect(html).toContain('<title>Privacy policy | Journ.al</title>');
    for (const word of ['Google', 'Neon', 'Cloudinary', 'Vercel', 'Delete my account', 'mailto:']) expect(html).toContain(word);
  });

  it('serves a deletion page that explains the in-app route and the email route', () => {
    const html = legal.deleteAccount();
    expect(html).toContain('Me</strong>');
    expect(html).toContain('Delete my account');
    expect(html).toContain('mailto:');
    expect(html).toContain('href="/privacy"');
  });

  it('links the policy to the deletion page', () => {
    expect(legal.privacy()).toContain('href="/delete-account"');
  });
});
