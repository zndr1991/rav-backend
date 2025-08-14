const bcrypt = require('bcrypt');
bcrypt.hash('Gante675', 10, (err, hash) => {
  console.log(hash);
});