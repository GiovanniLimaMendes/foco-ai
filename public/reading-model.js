export function splitText(text, size = 650) {
  const words = text.trim().split(/\s+/u);
  const chunks = [];
  let current = '';
  for(const word of words) {
    if(!word) continue;
    if(current && current.length + word.length + 1 > size) {chunks.push(current); current='';}
    // Bound long URLs or words too, so the explain endpoint accepts every chunk.
    let rest = word;
    while(rest.length > size) { if(current) {chunks.push(current); current='';} chunks.push(rest.slice(0,size)); rest=rest.slice(size); }
    current += (current ? ' ':'') + rest;
  }
  if(current) chunks.push(current);
  return chunks;
}
