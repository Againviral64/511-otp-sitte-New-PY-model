import fs from 'fs';
import path from 'path';

export async function GET() {
    try {
        const filePath = path.join(process.cwd(), 'views/dashboard.html');
        const html = fs.readFileSync(filePath, 'utf8');
        return new Response(html, {
            headers: { 'Content-Type': 'text/html' }
        });
    } catch (err) {
        return new Response('Page Not Found', { status: 404 });
    }
}
