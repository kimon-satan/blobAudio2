#!/bin/bash 

SEARCH_DIR="./samples"

echo "var files = [" > test

for entry in "$SEARCH_DIR"/* 
do
    echo -n  "'" >> test
    it=${entry##*/}
    echo -n ${it} >> test
    echo "', " >> test
done

echo " ] " >> test
