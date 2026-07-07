const fs = require('fs');
const path = require('path');

const dir = './';

function walkDir(d) {
  const files = fs.readdirSync(d);
  files.forEach(file => {
    const filePath = path.join(d, file);
    if (fs.statSync(filePath).isDirectory()) {
      if (['node_modules', '.git', '.expo', 'dist', 'scratch', 'assets'].includes(file)) return;
      walkDir(filePath);
    } else {
      if (!['.ts', '.tsx', '.json', '.md', '.sql'].includes(path.extname(filePath))) return;
      if (filePath.endsWith('package-lock.json')) return;

      let content = fs.readFileSync(filePath, 'utf8');
      const original = content;

      content = content.replace(/SmartBiz/g, 'SmartEnterprise');
      content = content.replace(/smartbiz/g, 'smartenterprise');
      content = content.replace(/SMARTBIZ/g, 'SMARTENTERPRISE');

      if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${filePath}`);
      }
    }
  });
}

walkDir(dir);
