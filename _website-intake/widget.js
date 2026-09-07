/* Legacy widget URL now supplies a direct, truthful contact launcher. */
(() => {
  if (document.getElementById('pt-website-request-widget')) return;
  const link = document.createElement('a');
  link.id = 'pt-website-request-widget';
  link.href = 'https://fixingfortmyers.com/#contact';
  link.textContent = 'Contact the team';
  link.setAttribute('aria-label', 'Contact the Perfect Timing Auto Repair team');
  Object.assign(link.style, { position:'fixed',right:'20px',bottom:'88px',zIndex:'1000',background:'#078bd2',color:'#fff',padding:'13px 18px',borderRadius:'24px',font:'700 15px system-ui,sans-serif',textDecoration:'none',boxShadow:'0 4px 20px #0005' });
  document.body.append(link);
})();
