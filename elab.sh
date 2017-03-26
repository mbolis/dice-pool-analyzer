#!/bin/bash
awk '	BEGIN{FS=","}
	{ORS=NR%6?",":"\n"}
	NR%6==1{
		if($3~/.\+/)
			type="Almeno";
		else type="Esattamente";
		print $1 FS $2 FS type FS $4
	}
	NR%6!=1{print $4}' $1

