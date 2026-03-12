const fs = require('fs');
const XLSX = require('xlsx');

async function cekNomor(client) {
  const numbers = JSON.parse(fs.readFileSync("numbers.json", "utf-8"));
  const results = [];

  for (const num of numbers) {
    try {
      const result = await client.checkNumberStatus(num);
      const status = result && result.canReceiveMessage ? "Terdaftar WA" : "Tidak Terdaftar WA";
      results.push({ number: num, status });
      console.log(`${num}: ${status}`);
    } catch (err) {
      results.push({ number: num, status: "Error" });
      console.error(`❌ Error cek nomor ${num}:`, err.message);
    }
  }

  fs.writeFileSync("hasil.json", JSON.stringify(results, null, 2), "utf-8");
  fs.writeFileSync("hasil.txt", results.map(r => `${r.number} - ${r.status}`).join("\n"), "utf-8");

  const worksheet = XLSX.utils.json_to_sheet(results);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Hasil");
  XLSX.writeFile(workbook, "hasil.xlsx");

  return results;
}

module.exports = cekNomor;
