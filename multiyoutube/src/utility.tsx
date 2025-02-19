// with thanks to https://stackoverflow.com/questions/3426404/create-a-hexadecimal-colour-based-on-a-string-with-javascript
export function getColour(input: string) {
  const stringUniqueHash = [...input].reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);
  return `hsl(${stringUniqueHash % 360}, 50%, 85%)`;
}