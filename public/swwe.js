self.addEventListener('fetch', (event) => {
  console.log('fetch');
  event.respondWith(
    fetch(event.request)
      .catch(() => {
        // Handle offline scenario
        if (event.request.mode === 'navigate') {
          // If it's a navigation (like opening a page)
          return new Response(`
            <!doctype html>
            <html>
              <head>
                <meta charset="utf-8">
                <title>Offline</title>
                <style>
                  body {
                    font-family: system-ui, sans-serif;
                    text-align: center;
                    padding: 3rem;
                    background: #fafafa;
                    color: #333;
                  }
                  h1 {
                    font-size: 2rem;
                    margin-bottom: 1rem;
                  }
                  p {
                    font-size: 1.2rem;
                    color: #666;
                  }
                </style>
              </head>
              <body>
                <h1>You’re Offline</h1>
                <p>Check your internet connection and try again.</p>
              </body>
            </html>
          `, {
            headers: { 'Content-Type': 'text/html' }
          });
        }

        // For non-navigation requests (CSS, JS, images, etc.)
        return new Response('', { status: 503, statusText: 'Offline' });
      })
  );
});

