#!/bin/bash

~/TON/build/crypto/fift -s <<EOF
newkeypair
drop
.s
"notowner.pk" B>file
bye

echo "Private key saved to random.pk"