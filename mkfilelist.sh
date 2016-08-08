#!/bin/bash 

SEARCH_DIR="./samples"

echo "var files = {" > test

for entry in "$SEARCH_DIR"/* 
do
    it=${entry##*/}
    echo -n ${it%.wav} >> test
    echo -n ": '" >> test
    echo -n ${it} >> test
    echo -n "', " >> test
done

echo " } " >> test
