/* eslint-disable */
/**
 * GENERATED — do not hand-edit.
 *
 * The app's syllabus snapshot: 6 BEU branches and 30 GATE papers, taken from the site's
 * `src/assets/data/{branches,gate}/*.json` plus the fixes this app carries.
 *
 * Neither the prose (one copy per distinct string, packed in `./table`) nor the
 * records below carry any formatting: `./decode.ts` documents the wire format
 * and turns it back into the `JSON.parse`-able strings the screens consume, on
 * first read per branch. Regenerate with `bun scripts/data/build-packs.ts`;
 * check it with `bun scripts/data/verify-packs.ts`.
 */
import { decodeBranch, decodeGate, lazy, makeTable, wireName } from "./decode";
import { CHUNKS, COUNTS } from "./table";

export const DATA_SNAPSHOT = "2026-10-28";

export const BRANCH_META: { code: string; name: string; short: string }[] = [
  { code: "cse", name: "Computer Science & Engineering", short: "CSE" },
  { code: "ece", name: "Electronics & Communication Engineering", short: "ECE" },
  { code: "ee", name: "Electrical Engineering", short: "EE" },
  { code: "mech", name: "Mechanical Engineering", short: "MECH" },
  { code: "civil", name: "Civil Engineering", short: "CIVIL" },
  { code: "eee", name: "Electrical & Electronics Engineering", short: "EEE" },
];

/** The records in the wire format `./decode.ts` documents; live data reuses them. */
export const BRANCH_WIRE: Record<string, string> = {
  cse: `Computer Science & Engineering
#1
Engineering Mathematics - I|Theory|3|100102|3|0|0|0|1
Engineering Physics|Theory|3|100104|3|0|0|2|3
Introduction to AI|Theory|3|100105|3|0|0|4|5
Computer Fundamentals & Emerging Technologies|Theory|3|100108|3|0|0|6|7
Universal Human Values|Theory|2|100109|2|0|0|8|-
Essence of Indian Constitution|Theory|0|100110|3|0|0|9|-
Basics of Electrical & Electronics Engineering|Theory|3|100111|3|0|0|10|11
Engineering Physics Lab|Practical|1|100104P|0|0|2|12|-
Basics of Electrical & Electronics Engineering Lab|Practical|1|100111P|0|0|2|13|-
Programming for Problem Solving Lab|Practical|1|100112P|0|0|2|14|-
#2
Engineering Chemistry|Theory|3|100215|3|0|0|15|16
Engineering Mathematics– II|Theory|4|100202|3|1|0|17|18
Communicative English|Theory|3|100216|3|0|0|19|20
Sports/Yoga/NCC/NSS|Practical|1|100220P|0|0|2|21|-
Python Programming|Theory|2|100218|2|0|0|22|23
Introduction to Web Designing|Theory|3|100219|3|0|0|24|25
Engineering Chemistry Lab|Practical|1|100215P|0|0|2|26|-
Communicative English Lab|Practical|1|100216P|0|0|2|27|-
Python Programming Lab|Practical|1|100218P|0|0|2|28|29
Introduction to Web Designing Lab|Practical|1|100219P|0|0|2|30|-
#3
Digital Electronics|Theory|3|105301|3|0|0|31|32
Data Structure & Algorithms|Theory|3|105302|3|0|0|33|34
Object Oriented Programming Using Java|Theory|3|105303|3|0|0|35|36
Discrete Mathematics and Graph Theory|Theory|4|105304|3|1|0|37|38
Operating Systems|Theory|3|105305|3|0|0|39|40
Universal Human Values|Theory|3|105306|3|0|0|41|-
Indian Knowledge System|Theory|0|105307|3|0|0|42|43
Digital Electronics Lab|Practical|1|105301P|0|0|2|44|-
Data Structure & Algorithms Lab|Practical|1|105302P|0|0|2|45|-
Object Oriented Programming Using JAVA Lab|Practical|1|105303P|0|0|2|46|-
Operating Systems Lab|Practical|1|105305P|0|0|2|47|-
Internship – I|Practical|2|105308|0|0|0|48|-
#4
Computer Organization and Architecture|Theory|3|105401|3|0|0|49|50
Formal Language and Automata Theory|Theory|4|105402|3|1|0|51|52
Design and Analysis of Algorithms|Theory|3|105403|3|0|0|53|54
Database Management System|Theory|3|105404|3|0|0|55|56
Effective Technical Communication|Theory|3|105405|3|0|0|57|58
Computer Networks|Theory|3|105406|3|0|0|59|60
Computer Organization and Architecture Lab|Practical|1|105401P|0|0|2|61|-
Design and Analysis of Algorithms Lab|Practical|1|105403P|0|0|2|62|-
Database Management System Lab|Practical|1|105404P|0|0|2|63|-
Computer Networks Lab|Practical|1|105406P|0|0|2|64|-
NPTEL-I (Open Course)|Theory|3|105407|0|0|0|-|-
#5
Professional Skill Development|Theory|3|100508|3|0|0|65|66
Artificial Intelligence|Theory|3|105501|3|0|0|67|68
Database Management Systems|Theory|3|105502|3|0|0|69|70
Formal Language & Automata Theory|Theory|4|105503|3|1|0|71|72
Software Engineering|Theory|3|105504|3|0|0|73|74
Database Management Systems Lab|Practical|2|105502P|0|0|4|75|-
#6
Computer Networks|Theory|3|100602|3|0|0|76|77
Compiler Design|Theory|3|105601|3|0|0|78|79
Machine Learning|Theory|4|105602|3|1|0|80|81
Signals and Systems|Theory|3|105603|3|0|0|82|83|e
Graph Theory|Theory|3|105604|3|0|0|84|85|e
Introduction to Java Programming Language|Theory|3|105606|3|0|0|86|87|e
Probability and Statistical Inference|Theory|3|105607|3|0|0|88|89|e
Numerical Methods|Theory|3|105608|3|0|0|90|91|e
Information Theory and Coding|Theory|3|105609|3|0|0|92|93|e
Soft Computing|Theory|3|105610|3|0|0|94|95|e
Distributed Database|Theory|3|105611|3|0|0|96|97|e
Advanced Data Structures and Algorithms|Theory|3|105612|3|0|0|98|99|e
Advance Java Programming Language|Theory|3|105613|3|0|0|100|101|e
Web and Internet Technology|Theory|3|105614|3|0|0|102|103|e
Multimedia Technology and its Applications|Theory|3|105615|3|0|0|104|105|e
Cryptography and Network Security|Theory|3|105616|3|0|0|106|107|e
Mobile and Wireless Computing|Theory|3|105617|3|0|0|108|109|e
Computer Graphics|Theory|3|100610|3|0|0|110|111|e
Complier Design Lab|Practical|2|105601P|0|0|4|112|-
Computer Networks Lab|Practical|2|100601P|0|0|4|113|-
Python Programming Lab|Practical|1|105620P|0|0|2|114|-
NPTEL Courses-2 Lab|Practical|2|100604P|0|0|4|-|-`,
  ece: `Electronics & Communication Engineering
#1
Communication Skills|Theory|3|100101|3|0|0|115|116
Engineering Mathematics-I|Theory|3|100102|3|0|0|117|118
Engineering Physics|Theory|3|100104|3|0|0|119|120
Introduction to AI|Theory|3|100105|3|0|0|121|122
Basic Electrical Engineering|Theory|3|100106|3|0|0|123|124
Communication Skills Lab|Practical|1|100101P|0|0|2|125|-
Engineering Physics Lab|Practical|1|100104P|0|0|2|12|-
Basic Electrical Engineering Lab|Practical|1|100106P|0|0|2|126|-
Programming for Problem Solving Lab|Practical|1|100112P|0|0|2|127|-
Sports/Yoga/NCC/NSS|Practical|1|100113P|0|0|2|128|-
#2
Engineering Chemistry|Theory|3|100215|3|0|0|129|130
Engineering Mathematics– II|Theory|4|100202|3|1|0|131|132
Communicative English|Theory|3|100216|3|0|0|19|133
Sports/Yoga/NCC/NSS|Practical|1|100220P|0|0|2|134|-
Basic Electronics|Theory|3|100209|3|0|0|135|136
Engineering Graphics and Design|Theory|1|100217|1|0|0|137|138
Engineering Chemistry Lab|Practical|1|100215P|0|0|2|26|-
Communicative English Lab|Practical|1|100216P|0|0|2|139|-
Basic Electronics Lab|Practical|1|100209P|0|0|2|140|-
Engineering Graphics and Design Lab|Practical|2|100217P|0|0|4|141|-
#3
Electronic Devices and Circuit Theory|Theory|3|104301|3|0|0|142|143
Object Oriented Programming|Theory|3|104302|3|0|0|144|145
Network Theory|Theory|4|104303|3|1|0|146|147
Signal & System|Theory|3|104304|3|0|0|148|149
Engineering Mathematics-III (PDE, Prob/stat)|Theory|4|104305|3|1|0|150|151
Universal Human Values|Theory|3|104306|3|0|0|41|-
Indian Knowledge System|Theory|0|104307|3|0|0|42|152
Electronic Devices and Circuit Theory Lab|Practical|1|104301P|0|0|2|153|-
Object Oriented Programming Lab|Practical|1|104302P|0|0|2|154|-
Internship – I|Practical|2|104308|0|0|0|48|-
#4
Analog Electronics and Integrated Circuits|Theory|3|104401|3|0|0|155|156
Digital Circuits|Theory|3|104402|3|0|0|157|158
Electromagnetic Field Theory|Theory|4|104403|3|1|0|159|160
Analog Communication|Theory|3|104404|3|0|0|161|162
Electronics Materials and Instrumentation|Theory|3|104405|3|0|0|163|164
Analog Electronics and Integrated Circuits Lab|Practical|1|104401P|0|0|2|165|-
Digital Circuits Lab|Practical|1|104402P|0|0|2|166|-
Analog Communication Lab|Practical|1|104404P|0|0|2|167|-
Electronics Materials and Instrumentation Lab|Practical|1|104405P|0|0|2|168|-
NPTEL-I (Open Course)|Theory|3|104406|0|0|0|169|-
#5
Digital Signal Processing|Theory|3|EC109|3|0|0|170|171
Digital Signal Processing Lab|Theory|1|EC109P|0|0|2|172|-
Microprocessors And Microcontrollers|Theory|3|EC110|3|0|0|173|174
Linear Control Systems|Theory|4|EC111|3|1|0|175|176
Linear Integrated Circuits And|Theory|3|EC112|3|0|0|177|178
Probability Theory And Stochastic|Theory|3|EC113|3|0|0|179|180
Computer Networks And Security|Theory|3|ES114|3|0|0|181|182`,
  ee: `Electrical Engineering
#1
Communication Skills|Theory|3|100101|3|0|0|115|116
Engineering Mathematics-I|Theory|3|100102|3|0|0|117|118
Engineering Physics|Theory|3|100104|3|0|0|119|120
Introduction to AI|Theory|3|100105|3|0|0|121|122
Basic Electrical Engineering|Theory|3|100106|3|0|0|123|124
Communication Skills Lab|Practical|1|100101P|0|0|2|125|-
Engineering Physics Lab|Practical|1|100104P|0|0|2|12|-
Basic Electrical Engineering Lab|Practical|1|100106P|0|0|2|126|-
Programming for Problem Solving Lab|Practical|1|100112P|0|0|2|127|-
Sports/Yoga/NCC/NSS|Practical|1|100113P|0|0|2|128|-
#2
Engineering Chemistry|Theory|3|100215|3|0|0|129|130
Engineering Mathematics– II|Theory|4|100202|3|1|0|131|132
Communicative English|Theory|3|100216|3|0|0|19|133
Sports/Yoga/NCC/NSS|Practical|1|100220P|0|0|2|134|-
Basic Electronics|Theory|3|100209|3|0|0|135|136
Engineering Graphics and Design|Theory|1|100217|1|0|0|137|138
Engineering Chemistry Lab|Practical|1|100215P|0|0|2|26|-
Communicative English Lab|Practical|1|100216P|0|0|2|139|-
Basic Electronics Lab|Practical|1|100209P|0|0|2|140|-
Engineering Graphics and Design Lab|Practical|2|100217P|0|0|4|141|-
#3
Electrical Circuit Analysis|Theory|4|103301|3|1|0|183|184
Analog Electronics|Theory|4|103302|3|1|0|185|186
Electrical Machine-1|Theory|4|103303|3|1|0|187|-
Engineering Mathematics-III (PDE, Prob/stat)|Theory|4|103304|3|1|0|150|188
Engineering Mechanics|Theory|4|103305|3|1|0|189|190
Universal Human Values|Theory|3|103306|3|0|0|191|-
Indian Knowledge System|Theory|0|103307|3|0|0|42|192
Electrical Circuit Analysis Lab|Practical|1|103301P|0|0|2|193|-
Analog Electronics Lab|Practical|1|103302P|0|0|2|194|-
Electrical Machine-I Lab|Practical|1|103303P|0|0|2|195|-
Internship – I|Practical|2|103308|0|0|0|48|-
#4
Digital Electronics|Theory|4|103401|3|1|0|196|197
Signals and Systems|Theory|4|103402|3|1|0|198|199
Electrical Machines - II|Theory|4|103403|3|1|0|200|201
Electromagnetic Field Theory|Theory|4|103404|3|1|0|202|203
Control System|Theory|4|103405|3|1|0|204|205
Environmental Science|Theory|0|103406|3|0|0|206|207
Digital Electronics Lab|Practical|1|103401P|0|0|2|208|-
Electrical Machine - II Lab|Practical|1|103403P|0|0|2|209|-
Control System Lab|Practical|1|103405P|0|0|2|210|-
NPTEL-I (Open Course)|Theory|3|103407|0|0|0|169|-
#5
Analog & Digital Communication System|Theory|4|PCC-EEE19|3|0|2|211|-
Capstone Design Project|Theory|0|X-CAPSTONE-DESIGN-PROJEC|3|0|0|-|-
Constitution of India/ Essence of Indian|Theory|0|MC 501|3|0|0|212|-
Control Systems|Theory|4|PCC-EEE15|3|0|2|213|214
MOOCs / SWAYAM / NPTEL Courses - 2|Theory|2|X-MOOCS-SWAYAM-NPTEL-COU|2|0|0|-|-
Power Electronics|Theory|4|PCC-EEE17|3|0|2|215|216
Power Systems - I (Apparatus and|Theory|4|PCC-EEE13|3|0|2|217|218
Professional Elective Laboratory - 1|Theory|1|X-PROFESSIONAL-ELECTIVE-|0|0|2|-|-
Summer Entrepreneurship - II|Theory|6|X-SUMMER-ENTREPRENEURSHI|0|0|12|-|-
PCC-EEE14 Power Systems - I Lab|Theory|1|X-PCC-EEE14-POWER-SYSTEM|0|0|2|219|-`,
  mech: `Mechanical Engineering
#1
Communication Skills|Theory|3|100101|3|0|0|220|221
Engineering Mathematics-I|Theory|3|100102|3|0|0|222|223
Engineering Chemistry|Theory|3|100103|3|0|0|224|225
Introduction to AI|Theory|3|100105|3|0|0|121|226
Engineering Graphics and Design|Theory|2|100107|2|0|0|227|228
Communication Skills Lab|Practical|1|100101P|0|0|2|229|-
Engineering Chemistry Lab|Practical|1|100103P|0|0|2|230|-
Engineering Graphics and Design Lab|Practical|2|100107P|0|0|4|231|-
Programming for Problem Solving Lab|Practical|1|100112P|0|0|2|232|-
Sports/Yoga/NCC/NSS|Practical|1|100113P|0|0|2|233|-
#2
Engineering Physics|Theory|3|100201|3|0|0|234|235
Engineering Mathematics– II|Theory|4|100202|3|1|0|17|236
Programming for Problem Solving|Theory|3|100203|3|0|0|237|238
Workshop Practices|Theory|2|100206|2|0|0|239|240
Elements of Mechanical Engineering|Theory|3|100204|3|0|0|241|242
Engineering Physics Lab|Practical|1|100201P|0|0|2|243|-
Programming for Problem Solving Lab|Practical|1|100203P|0|0|2|244|-
Workshop Practices Lab|Practical|1|100206P|0|0|2|245|-
Elements of Mechanical Engineering Lab|Practical|1|100204P|0|0|2|246|-
#3
Engineering Mechanics|Theory|4|102301|3|1|0|247|248
Material Science and Engineering|Theory|3|102302|3|0|0|249|-
Engineering Mathematics-III (PDE, Prob/stat)|Theory|4|102303|3|1|0|250|188
Thermodynamics|Theory|3|102304|3|0|0|251|252
Basic Electronics Engineering|Theory|3|102305|3|0|0|253|254
Universal Human Values|Theory|3|102306|3|0|0|255|-
Indian Knowledge System|Theory|0|102307|3|0|0|42|256
Engineering Mechanics Lab|Practical|1|102301P|0|0|2|257|-
Basic Electronic Engineering Lab|Practical|1|102305P|0|0|2|258|-
Internship – I|Practical|2|102308|0|0|0|259|-
#4
Applied Thermodynamics|Theory|4|102401|3|1|0|260|261
Fluid Mechanics and Hydraulic Machines|Theory|4|102402|3|1|0|262|263
Strength of Material|Theory|4|102403|3|1|0|264|265
Kinematics of Machine|Theory|3|102404|3|0|0|266|267
Project Management|Theory|3|102405|3|0|0|268|269
Fluid Mechanics and Hydraulic Machines Lab|Practical|1|102402P|0|0|2|270|-
Strength of Material Lab|Practical|1|102403P|0|0|2|271|-
Kinematics of Machine Lab|Practical|1|102404P|0|0|2|272|-
NPTEL-I (Open Course)|Theory|3|102406|0|0|0|273|-
#5
Heat Transfer|Theory|4.5|PCC-ME 301|3|0|3|274|275
Fluid Machinery|Theory|4.5|PCC-ME 302|3|0|3|276|277
Manufacturing Processes|Theory|4.5|PCC-ME 303|3|0|3|278|279
Kinematics of Machine|Theory|4|PCC-ME 304|3|1|0|280|281
Constitution of India / Essence of Indian|Theory|0|X-CONSTITUTION-OF-INDIA-|3|0|0|-|-
Summer Entrepreneurship-II|Theory|6|X-SUMMER-ENTREPRENEURSHI|0|0|12|-|-
Open Elective- I (MOOCs / SWAYAM / NPTEL|Theory|3|X-OPEN-ELECTIVE-I-MOOCS-|3|0|0|-|-
Graduate Employability Skills and|Theory|0|X-GRADUATE-EMPLOYABILITY|3|0|0|-|-
#6
Design of Machine Elements|Theory|3|102601|3|0|0|282|283
Dynamics of Machinery|Theory|3|102602|3|0|0|284|285
Manufacturing Technology|Theory|3|102603|3|0|0|286|287
Automation in Manufacturing|Theory|3|102605|3|0|0|288|289
Process Planning and Cost Estimation|Theory|3|102606|3|0|0|290|291|e
Power Plant Engineering|Theory|3|102610|3|0|0|292|293|e
Microprocessors in Automation|Theory|3|102608|3|0|0|294|295|e
Mechatronics Systems|Theory|3|102607|3|0|0|296|297|e
Composite Materials|Theory|3|102609|3|0|0|298|299|e
Renewable Energy Systems (Open Elective I)|Theory|3|102611|3|0|0|300|301
Design of Machine Elements Lab|Practical|1|102601P|0|0|2|302|-
Dynamics of Machinery Lab|Practical|1.5|102602P|0|0|3|303|-
Manufacturing Technology Lab|Practical|1.5|102603P|0|0|3|304|-
Automation in Manufacturing Lab|Practical|1|102605P|0|0|2|305|-`,
  civil: `Civil Engineering
#1
Communication Skills|Theory|3|100101|3|0|0|220|221
Engineering Mathematics-I|Theory|3|100102|3|0|0|222|223
Engineering Chemistry|Theory|3|100103|3|0|0|224|225
Introduction to AI|Theory|3|100105|3|0|0|121|226
Engineering Graphics and Design|Theory|2|100107|2|0|0|227|228
Communication Skills Lab|Practical|1|100101P|0|0|2|229|-
Engineering Chemistry Lab|Practical|1|100103P|0|0|2|230|-
Engineering Graphics and Design Lab|Practical|2|100107P|0|0|4|231|-
Programming for Problem Solving Lab|Practical|1|100112P|0|0|2|232|-
Sports/Yoga/NCC/NSS|Practical|1|100113P|0|0|2|233|-
#2
Engineering Physics|Theory|3|100201|3|0|0|306|235
Engineering Mathematics– II|Theory|4|100202|3|1|0|17|236
Programming for Problem Solving(PPS)|Theory|3|100203|3|0|0|237|307
Workshop|Theory|1|100211|1|0|0|308|240
Basic Electrical Engineering|Theory|3|100212|3|0|0|309|310
Engineering Physics Lab|Practical|1|100201P|0|0|2|243|-
Programming for Problem Solving Lab|Practical|1|100203P|0|0|2|244|-
Workshop Practices Lab|Practical|1|100211P|0|0|2|245|-
Basic Electrical Engineering Lab|Practical|1|100212P|0|0|2|311|-
Swatch Bharat Mission|Practical|1|100214P|0|0|2|312|-
#3
Solid Mechanics|Theory|3|101301|3|0|0|313|314
Engineering Mathematics-III (PDE, Prob/stat)|Theory|4|101302|3|1|0|315|316
Universal Human Values|Theory|3|101303|3|0|0|317|-
Surveying and Geomatics|Theory|3|101304|3|0|0|318|319
Fluid Mechanics|Theory|3|101305|3|0|0|320|321
Materials, Testing & Evaluation|Theory|3|101306|3|0|0|322|323
Indian Knowledge System|Theory|0|101307|3|0|0|42|324
Solid Mechanics Lab|Practical|1|101301P|0|0|2|325|-
Surveying and Geomatics Lab|Practical|1|101304P|0|0|2|326|-
Fluid Mechanics Lab|Practical|1|101305P|0|0|2|327|-
Materials, Testing & Evaluation Lab|Practical|1|101306P|0|0|2|328|-
Internship – I|Practical|2|101308|0|0|0|48|-
#4
Transportation Engineering|Theory|3|101401|3|0|0|329|330
Building Planning and Computer-Aided Civil Engineering Drawing|Theory|3|101402|3|0|0|331|332
Geotechnical Engineering-I|Theory|3|101403|3|0|0|333|334
Hydraulic Engineering|Theory|3|101404|3|0|0|335|336
Structural Analysis|Theory|3|101405|3|0|0|337|338
Engineering Geology|Theory|3|101406|3|0|0|339|340
Civil Engineering – Societal & Global Impact|Theory|0|101407|3|0|0|341|342
Transportation Engineering Lab|Practical|1|101401P|0|0|2|343|-
Building Planning and Computer-Aided Civil Engineering Drawing Lab|Practical|1|101402P|0|0|2|344|-
Geotechnical Engineering-I Lab|Practical|1|101403P|0|0|2|345|-
Hydraulic Engineering Lab|Practical|1|101404P|0|0|2|346|-
Engineering Geology Lab|Practical|1|101406P|0|0|2|347|-
NPTEL (Open Course)|Theory|3|101408|0|0|0|273|-
#5
Mechanics of Materials|Theory|3|PCC CE 301|3|0|0|348|349
Hydraulic Engineering|Theory|3|PCC CE 302|2|0|2|350|351
Analysis and Design of Concrete|Theory|3|PCC CE 303|2|1|0|352|353
Geotechnical Engineering -I|Theory|4|PCC CE 304|3|0|2|354|355
Hydrology & Water Resources|Theory|3|PCC CE 305|2|0|2|356|357
Environmental Engineering -I|Theory|4|PCC CE 306|3|0|2|358|359
Transportation Engineering|Theory|4|PCC CE 307|3|0|2|360|361
Environmental Science|Theory|0|MC 401|3|0|0|362|-
Summer Entrepreneurship-II|Theory|6|X-SUMMER-ENTREPRENEURSHI|0|0|12|-|-
#6
Construction Engineering & Management|Theory|3|101602|3|0|0|363|364
Design of Steel Structure|Theory|3|101603|2|1|0|365|366
Engineering Economics, Estimation & Costing|Theory|2|101604|2|0|0|367|368
Environmental Engineering-II|Theory|3|101605|3|0|0|369|370
Geotechnical Engineering -II|Theory|3|101606|3|0|0|371|372
Energy Science & Engineering|Theory|3|101607|3|0|0|373|374|e
Construction Productivity|Theory|3|101608|3|0|0|375|376|e
Environmental Systems|Theory|3|101611|3|0|0|377|378|e
Design of Hydraulic Structures/Irrigation Engineering|Theory|3|101612|3|0|0|379|380|e
Reliability Analysis of Structures|Theory|3|101614|3|0|0|381|382|e
Concrete Materials|Theory|3|101617|3|0|0|383|384|e
Structural Analysis – I|Theory|3|101618|3|0|0|385|386|e
Soil Mechanics – I|Theory|3|101619|3|0|0|387|388|e
Transportation Economics|Theory|3|101620|3|0|0|389|390|e
Infrastructure Planning and Design|Theory|3|101621|3|0|0|391|392|e
Repair & Rehabilitation of Structures|Theory|3|101622|3|0|0|393|394|e
Airport Planning and Design|Theory|3|101623|3|0|0|395|396|e
High Speed Rail Engineering|Theory|3|101624|3|0|0|397|398|e
Engineering Economics, Estimation & Costing Lab|Practical|1|101604P|0|0|2|399|-
NPTEL Courses-2|Practical|2|100604P|0|0|4|-|-`,
  eee: `Electrical & Electronics Engineering
#1
Communication Skills|Theory|3|100101|3|0|0|115|116
Engineering Mathematics-I|Theory|3|100102|3|0|0|117|118
Engineering Physics|Theory|3|100104|3|0|0|119|120
Introduction to AI|Theory|3|100105|3|0|0|121|122
Basic Electrical Engineering|Theory|3|100106|3|0|0|123|124
Communication Skills Lab|Practical|1|100101P|0|0|2|125|-
Engineering Physics Lab|Practical|1|100104P|0|0|2|12|-
Basic Electrical Engineering Lab|Practical|1|100106P|0|0|2|126|-
Programming for Problem Solving Lab|Practical|1|100112P|0|0|2|127|-
Sports/Yoga/NCC/NSS|Practical|1|100113P|0|0|2|128|-
#2
Engineering Chemistry|Theory|3|100215|3|0|0|129|130
Engineering Mathematics– II|Theory|4|100202|3|1|0|131|132
Communicative English|Theory|3|100216|3|0|0|19|133
Sports/Yoga/NCC/NSS|Practical|1|100220P|0|0|2|134|-
Basic Electronics|Theory|3|100209|3|0|0|135|136
Engineering Graphics and Design|Theory|1|100217|1|0|0|137|138
Engineering Chemistry Lab|Practical|1|100215P|0|0|2|26|-
Communicative English Lab|Practical|1|100216P|0|0|2|139|-
Basic Electronics Lab|Practical|1|100209P|0|0|2|140|-
Engineering Graphics and Design Lab|Practical|2|100217P|0|0|4|141|-
#3
Electrical Circuit Analysis|Theory|4|110301|3|1|0|183|184
Digital Electronics|Theory|4|110302|3|1|0|400|197
Engineering Mathematics-III (PDE, Prob/stat)|Theory|4|110303|3|1|0|150|401
Electromagnetic Field Theory|Theory|4|110304|3|1|0|402|403
Signals and Systems|Theory|3|110305|3|0|0|404|405
Universal Human Values|Theory|3|110306|3|0|0|191|-
Indian Knowledge System|Theory|0|110307|3|0|0|42|192
Electrical Circuit Analysis Lab|Practical|1|110301P|0|0|2|193|-
Digital Electronics Lab|Practical|1|110302P|0|0|2|406|-
Internship – I|Practical|2|110308|0|0|0|407|-
#4
Analog Electronics|Theory|4|110401|3|1|0|408|409
Digital Signal Processing|Theory|4|110402|3|1|0|410|411
Electrical Machine-I|Theory|4|110403|3|1|0|412|413
Microprocessor and Microcontroller|Theory|4|110404|3|1|0|414|415
Engineering Mechanics|Theory|3|110405|3|0|0|416|417
Analog Electronics Lab|Practical|1|110401P|0|0|2|418|-
Digital Signal Processing Lab|Practical|1|110402P|0|0|2|419|-
Electrical Machine-I Lab|Practical|1|110403P|0|0|2|420|-
Microprocessor and Microcontroller Lab|Practical|1|110404P|0|0|2|421|-
NPTEL-I (Open Course)|Theory|3|110406|0|0|0|169|-
#6
Digital Signal Processing|Theory|3|100606|3|0|0|422|423
Introduction to VLSI Design|Theory|3|100607|3|0|0|424|425
Professional Skill Development|Theory|3|100608|3|0|0|426|427
Measurements and Instrumentation|Theory|3|110601|3|0|0|428|429
Advanced Electric Drives|Theory|3|110602|3|0|0|430|431|e
Electrical Energy Conservation and Auditing|Theory|3|110608|3|0|0|432|433|e
Computer Architecture|Theory|3|100611|3|0|0|434|435|e
Digital Image & Video Processing|Theory|3|100614|3|0|0|436|-|e
Computational Electromagnetics|Theory|3|110603|3|0|0|437|438|e
Electrical Machine Design|Theory|3|110609|3|0|0|439|440|e
Digital Control Systems|Theory|3|100612|3|0|0|441|442|e
Electrical Drives|Theory|3|100613|3|0|0|443|444|e
Digital Signal Processing Lab|Practical|1|100606P|0|0|2|445|-
Introduction to VLSI Design Lab|Practical|1|100607P|0|0|2|446|-
Electronics Design Laboratory|Practical|1|100609P|0|0|2|447|448
Measurements and Instrumentation Lab|Practical|1|110601P|0|0|2|449|-
Power Systems-II Lab|Practical|1|103601P|0|0|2|-|-`,
};

export const GATE_WIRE: Record<string, string> = {
  "CS": `Computer Science & Information Technology
Section 1: Engineering Mathematics|450
Section 2: Digital Logic|451
Section 3: Computer Organization and Architecture|452
Section 4: Programming and Data Structures|453
Section 5: Algorithms|454
Section 6: Theory of Computation|455
Section 7: Compiler Design|456
Section 8: Operating System|457
Section 9: Databases|458
Section 10: Computer Networks|459`,
  "CE": `Civil Engineering
Section 1: Engineering Mathematics|460
Section 2: Structural Engineering|461
Section 3: Geotechnical Engineering|462
Section 4: Water Resources Engineering|463
Section 5: Environmental Engineering|464
Section 6: Transportation Engineering|465
Section 7: Geomatics Engineering|466`,
  "EE": `Electrical Engineering
Section 1: Engineering Mathematics|467
Section 2: Electric circuits|468
Section 3: Electromagnetic Fields|469
Section 4: Signals and Systems|470
Section 5: Electrical Machines|471
Section 6: Power Systems|472
Section 7: Control Systems|473
Section 8: Electrical and Electronic Measurements|474
Section 9: Analog and Digital Electronics|475
Section 10: Power Electronics|476`,
  "EC": `Electronics & Communication Engineering
Section 1: Engineering Mathematics|477
Section 2: Networks, Signals and Systems|478
Section 3: Electronic Devices|479
Section 4: Analog Circuits|480
Section 5: Digital Circuits|481
Section 6: Control Systems|482
Section 7: Communications|483
Section 8: Electromagnetics|484`,
  "ME": `Mechanical Engineering
Section 1: Engineering Mathematics|485
Section 2: Applied Mechanics and Design|486
Section 3: Fluid Mechanics and Thermal Sciences|487
Section 4: Materials, Manufacturing and Industrial Engineering|488`,
  "DA": `Data Science & Artificial Intelligence
Probability and Statistics|489
Linear Algebra|490
Calculus and Optimization|491
Programming, Data Structures and Algorithms|492
Database Management and Warehousing|493
Machine Learning|494
AI|495`,
  "AE": `Aerospace Engineering
Section 1: Engineering Mathematics|496
Section 2: Flight Mechanics|497
Section 3: Space Dynamics|498
Section 4: Aerodynamics|499
Section 5: Structures|500
Section 6: Propulsion|501`,
  "GG": `Geology & Geophysics
Part-A: Common Section|502
Part-B (B1): Geology|503
Part-B (B2): Geophysics|504`,
  "AG": `Agricultural Engineering
Section 1: Engineering Mathematics|505
Section 2: Farm Machinery|506
Section 3: Farm Power|507
Section 4: Soil and Water Conservation Engineering|508
Section 5: Irrigation and Drainage Engineering|509
Section 6: Agricultural Process Engineering|510
Section 7: Dairy and Food Engineering|511`,
  "IN": `Instrumentation Engineering
Section 1: Engineering Mathematics|512
Section 2: Electricity and Magnetism|469
Section 3: Electrical Circuits and Machines|513
Section 4: Signals and Systems|514
Section 5: Control Systems|515
Section 6: Analog Electronics|516
Section 7: Digital Electronics|517
Section 8: Measurements|518
Section 9: Sensors and Industrial Instrumentation|519
Section 10: Communication and Optical Instrumentation|520`,
  "AR": `Architecture and Planning
Section 1: Architecture, Planning and Design|521
Section 2: Construction and Management|522
Section 3: Environmental Planning and Design|523
Section 4: Urban Design, landscape and Conservation|524
Section 5: Planning process|525
Section 6: Housing|526
Section 7: Services and Infrastructure|527`,
  "MA": `Mathematics
Calculus|528
Linear Algebra|529
Real Analysis|530
Complex Analysis|531
Ordinary Differential Equations|532
Algebra|533
Functional Analysis|534
Numerical Analysis|535
Partial Differential Equations|536
Topology|537
Linear Programming|538`,
  "BM": `Biomedical Engineering
Engineering Mathematics|539
Electrical Circuits|540
Signals and Systems|541
Analog and Digital Electronics|542
Measurements and Control Systems|543
Sensors and Bioinstrumentation|544
Human Anatomy and Physiology|545
Medical Imaging Systems|546
Biomechanics|547
Biomaterials|548`,
  "BT": `Biotechnology
Section 1: Engineering Mathematics|549
Section 2: General Biology|550
Section 3: Genetics, Cellular and Molecular Biology|551
Section 4: Fundamentals of Biological Engineering|552
Section 5: Bioprocess Engineering and Process Biotechnology|553
Section 6: Plant, Animal and Microbial Biotechnology|554
Section 7: Recombinant DNA technology and Other Tools in Biotechnology|555`,
  "MN": `Mining Engineering
Section 1: Engineering Mathematics|556
Section 2: Mining Geology, Mine Development and Surveying|557
Section 3: Geomechanics and Ground Control|558
Section 4: Mining Methods and Machinery|559
Section 5: Surface Environment, Mine Ventilation and Underground Hazards|560
Section 6: Mineral Economics, Mine Planning, Systems Engineering|561`,
  "MT": `Metallurgical Engineering
Section 1: Engineering Mathematics|562
Section 2: Metallurgical Thermodynamics|563
Section 3: Transport Phenomena and Rate Processes|564
Section 4: Mineral Processing and Extractive Metallurgy|565
Section 5: Physical Metallurgy|566
Section 6: Mechanical Metallurgy|567
Section 7: Manufacturing Processes|568`,
  "CH": `Chemical Engineering
Section 1: Engineering Mathematics|569
Section 2: Process Calculations and Thermodynamics|570
Section 3: Fluid Mechanics and Mechanical Operations|571
Section 4: Heat Transfer|572
Section 5: Mass Transfer|573
Section 6: Chemical Reaction Engineering|574
Section 7: Instrumentation and Process Control|575
Section 8: Plant Design and Economics|576
Section 9: Chemical Technology|577`,
  "NM": `Naval Architecture & Marine Engineering
Section 1: Engineering Mathematics|578
Section 2: Applied Mechanics and Structures|579
Section 3: Fluid Mechanics and Marine Hydrodynamics|580
Section 4: Naval Architecture and Ocean Engineering|581
Section 5: Thermodynamics and Marine Engineering|582`,
  "PE": `Petroleum Engineering
Linear Algebra|583
Calculus|584
Differential Equations|585
Complex Variables|586
Probability and Statistics|587
Numerical Methods|588
Petroleum Exploration|589
Oil and Gas Well Drilling Technology|590
Reservoir Engineering|591
Petroleum Production Operations|592
Offshore Drilling and Production Practices|593
Petroleum Formation Evaluation|594
Oil and Gas Well Testing|595
Health Safety and Environment in Petroleum Industry|596
Enhanced Oil Recovery Techniques|597
Latest Trends in Petroleum Engineering|598`,
  "CY": `Chemistry
Section 1: Physical Chemistry|599
Section 2: Inorganic Chemistry|600
Section 3: Organic Chemistry|601`,
  "PH": `Physics
Section 1: Mathematical Physics|602
Section 2: Classical Mechanics|603
Section 3: Electromagnetic Theory|604
Section 4: Quantum Mechanics|605
Section 5: Thermodynamics and Statistical Physics|606
Section 6: Atomic and Molecular Physics|607
Section 7: Solid State Physics|608
Section 8: Electronics|609
Section 9: Nuclear and Particle Physics|610`,
  "PI": `Production & Industrial Engineering
Section 1: Engineering Mathematics|611
Section 2: General Engineering|612
Section 3: Manufacturing Processes I|613
Section 4: Manufacturing Processes II|614
Section 5: Quality and Reliability|615
Section 6: Industrial Engineering|616
Section 7: Operations research and Operations management|617`,
  "ST": `Statistics
Calculus|618
Matrix Theory|619
Probability|620
Standard Discrete and Continuous Univariate Distributions|621
Stochastic Processes|622
Estimation|623
Testing of Hypotheses|624
Non-parametric Statistics|625
Multivariate Analysis|626
Regression Analysis|627`,
  "TF": `Textile Engineering & Fibre Science
Section 1: Textile Fibres|628
Section 2: Yarn Manufacture, Yarn Structure and Properties|629
Section 3: Fabric Manufacture, Structure and Properties|630
Section 4: Textile Testing|631
Section 5: Chemical Processing|632`,
  "ES": `Environmental Science & Engineering
Section 1: Mathematics Foundation|633
Section 2: Environmental Chemistry|634
Section 3: Environmental Microbiology|635
Section 4: Water Resources and Environmental Hydraulics|636
Section 5: Water & Wastewater Treatment and Management|637
Section 6: Air and Noise Pollution|638
Section 7: Solid and Hazardous Waste Management|639
Section 8: Global and Regional Environmental Issues|640
Section 9: Environmental Management and Sustainable Development|641`,
  "XE": `Engineering Sciences
Section 1: Linear Algebra|642
Section 2: Calculus|643
Section 3: Vector Calculus|644
Section 4: Complex variables|645
Section 5: Ordinary Differential Equations|646
Section 6: Partial Differential Equations|647
Section 7: Probability and Statistics|648
Section 8: Numerical Methods|649
Section 1: Flow and Fluid Properties|650
Section 2: Kinematics of Fluid Motion|651
Section 3: Integral Analysis for a Control Volume|652
Section 4: Differential Analysis|653
Section 5: Dimensional Analysis|654
Section 6: Internal Flows|655
Section 7: Bernoulli’s Equation and its Applications, Potential Flows|656
Section 8: External Flows|657
Section 1: Classification and Structure of Materials|658
Section 2: Thermodynamics, Kinetics and Phase Transformations|659
Section 3: Properties and Applications of Materials|660
Section 4: Characterization and Measurements of Properties|661
Section 5: Processing of Materials|662
Section 6: Degradation of Materials|663
Section 1: Mechanics of rigid bodies|664
Section 2: Mechanics of deformable bodies|665
Section 3: Vibrations|666
Section 1: Basic Concepts|667
Section 2: First Law of Thermodynamics|668
Section 3: Second Law of Thermodynamics|669
Section 4: Properties of Pure Substances|670
Section 5: Thermodynamic Relations|671
Section 6: Thermodynamic Cycles|672
Section 7: Ideal Gas Mixtures|673
Section 1: Chemistry of High Polymers|674
Section 2: Polymer Characterization|675
Section 3: Synthesis, Manufacturing and Properties|676
Section 4: Polymer Blends and Composites|677
Section 5: Polymer Technology|678
Section 6: Polymer Rheology|679
Section 7: Polymer Processing|680
Section 8: Polymer Testing|681
Section 9: Polymer Recycling and Waste management|682
Section 1: Food Chemistry and Nutrition|683
Section 2: Food Microbiology|684
Section 3: Food Products Technology|685
Section 4: Food Engineering|686
Section 1: Energy Resources and Conversion Technologies|687
Section 2: Energy Storage, Economics, Environment, and Efficiency|688`,
  "EY": `Ecology and Evolution
Section 1: Ecology|689
Section 2: Evolution|690
Section 3: Mathematics and Quantitative Ecology|691
Section 4: Behavioural Ecology|692
Section 5: Applied Ecology & Evolution|693`,
  "XH": `Humanities & Social Sciences
XH-B1 Reasoning and Comprehension (Compulsory for all XH candidates)|694
XH-C1 Economics|695
XH-C2 English|696
XH-C3 Linguistics|697
XH-C4 Philosophy|698
XH-C5 Psychology|699
XH-C6 Sociology|700`,
  "GE": `Geomatics Engineering
Part-A (Common): Engineering Mathematics and Basic Geomatics|701
Part-B1: Surveying and Mapping|702
Part-B2: Image Processing and Analysis|703`,
  "XL": `Life Sciences
Section 1: Atomic Structure and Periodicity|704
Section 2: Structure and Bonding|705
Section 3: s, p and d Block Elements|706
Section 4: Chemical Equilibria|707
Section 5: Electrochemistry|708
Section 6: Reaction Kinetics|709
Section 7: Thermodynamics|710
Section 8: Structure-Reactivity Correlations and Organic Reaction Mechanisms|711
Section 9: Chemistry of Biomolecules|712
Section 1: Plant Systematics|713
Section 2: Plant Anatomy|714
Section 3: Plant Development; Cell and Tissue Morphogenesis|715
Section 4: Plant Physiology and Biochemistry|716
Section 5: Genetics and Genomics|717
Section 6: Plant Breeding, Genetic Modification, Genome Editing|718
Section 7: Economic and Applied Botany|719
Section 8: Plant Pathology|720
Section 9: Ecology and Environment|721
Section 1: Historical Perspective|722
Section 2: Methods in Microbiology|723
Section 3: Microbial Taxonomy and Diversity|724
Section 4: Prokaryotic Cells: Structure and Function|725
Section 5: Microbial Growth|726
Section 6: Control of Micro-organisms|727
Section 7: Microbial Metabolism|728
Section 8: Microbial Diseases and Host Pathogen Interaction|729
Section 9: Chemotherapy/Antibiotics|730
Section 10: Microbial Genetics|731
Section 11: Microbial Ecology|732
Section 1: Animal Diversity|733
Section 2: Evolution|734
Section 3: Genetics|735
Section 4: Biochemistry and Molecular Biology|736
Section 5: Cell Biology|737
Section 6: Gene expression in Eukaryotes|738
Section 7: Animal Anatomy and Physiology|739
Section 8: Parasitology and Immunology|740
Section 9: Development Biology|741
Section 10: Ecology|742
Section 11: Animal Behaviour|743
Section 1: Food Chemistry and Nutrition|744
Section 2: Food Microbiology|745
Section 3: Food Products Technology|746
Section 4: Food Engineering|747`,
};

const table = makeTable(CHUNKS, COUNTS);

/** GATE chips, in the order the papers are listed above. */
export const GATE_META: { code: string; name: string }[] = Object.keys(GATE_WIRE).map((code) => ({
  code,
  name: wireName(GATE_WIRE[code]),
}));

/** Decoded on first read: `BRANCH_PACKS["cse"]` is the branch's JSON, built once. */
export const BRANCH_PACKS: Record<string, string> = lazy(BRANCH_WIRE, (code, wire) => decodeBranch(code, wire, table));

export const GATE_PACKS: Record<string, string> = lazy(GATE_WIRE, (code, wire) => decodeGate(code, wire, table));
