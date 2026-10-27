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

export const DATA_SNAPSHOT = "2026-10-26";

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
Engineering Physics|Theory|3|100110|3|0|0|0|1
Engineering Mathematics–I|Theory|4|100102|3|1|0|2|3
Programming for Problem Solving|Theory|3|100111|3|0|0|4|5
Swatch Bharat Mission|Practical|1|100115P|0|0|2|6|-
IT Workshop|Theory|2|100113|2|0|0|7|8
Basic Electrical Engineering|Theory|3|100106|3|0|0|9|10
Engineering Physics Lab|Practical|1|100110P|0|0|2|11|-
Programming for Problem Solving Lab|Practical|1|100111P|0|0|2|12|-
IT Workshop Lab|Practical|1|100113P|0|0|2|13|-
Basic Electrical Engineering Lab|Practical|1|100106P|0|0|2|14|-
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
Discrete Mathematics|Theory|4|100404|3|1|0|49|50
Computer Organization & Architecture|Theory|3|105401|3|0|0|51|52
Operating Systems|Theory|3|105403|3|0|0|53|54
Design and Analysis of Algorithms|Theory|3|105402|3|0|0|55|56
Digital Electronics|Theory|3|100403|3|0|0|57|58
Human Resource Development and Organizational Behavior|Theory|3|100407|3|0|0|59|60
Environmental Science|Theory|0|105410|3|0|0|61|-
Computer Organization & Architecture Lab|Practical|1|105401P|0|0|2|62|-
Operating Systems Lab|Practical|1|105403P|0|0|2|63|-
Design and Analysis of Algorithms Lab|Practical|1|105402P|0|0|2|64|-
Digital Electronics Lab|Practical|1|100403P|0|0|2|65|-
#5
Professional Skill Development|Theory|3|100508|3|0|0|66|67
Artificial Intelligence|Theory|3|105501|3|0|0|68|69
Database Management Systems|Theory|3|105502|3|0|0|70|71
Formal Language & Automata Theory|Theory|4|105503|3|1|0|72|73
Software Engineering|Theory|3|105504|3|0|0|74|75
Database Management Systems Lab|Practical|2|105502P|0|0|4|76|-
#6
Computer Networks|Theory|3|100602|3|0|0|77|78
Compiler Design|Theory|3|105601|3|0|0|79|80
Machine Learning|Theory|4|105602|3|1|0|81|82
Signals and Systems|Theory|3|105603|3|0|0|83|84|e
Graph Theory|Theory|3|105604|3|0|0|85|86|e
Introduction to Java Programming Language|Theory|3|105606|3|0|0|87|88|e
Probability and Statistical Inference|Theory|3|105607|3|0|0|89|90|e
Numerical Methods|Theory|3|105608|3|0|0|91|92|e
Information Theory and Coding|Theory|3|105609|3|0|0|93|94|e
Soft Computing|Theory|3|105610|3|0|0|95|96|e
Distributed Database|Theory|3|105611|3|0|0|97|98|e
Advanced Data Structures and Algorithms|Theory|3|105612|3|0|0|99|100|e
Advance Java Programming Language|Theory|3|105613|3|0|0|101|102|e
Web and Internet Technology|Theory|3|105614|3|0|0|103|104|e
Multimedia Technology and its Applications|Theory|3|105615|3|0|0|105|106|e
Cryptography and Network Security|Theory|3|105616|3|0|0|107|108|e
Mobile and Wireless Computing|Theory|3|105617|3|0|0|109|110|e
Computer Graphics|Theory|3|100610|3|0|0|111|112|e
Complier Design Lab|Practical|2|105601P|0|0|4|113|-
Computer Networks Lab|Practical|2|100601P|0|0|4|114|-
Python Programming Lab|Practical|1|105620P|0|0|2|115|-
NPTEL Courses-2 Lab|Practical|2|100604P|0|0|4|-|-`,
  ece: `Electronics & Communication Engineering
#1
Engineering Physics|Theory|3|100110|3|0|0|116|117
Engineering Mathematics–I|Theory|4|100102|3|1|0|2|3
Programming for Problem Solving|Theory|3|100111|3|0|0|4|5
Basic Electrical Engineering|Theory|3|100106|3|0|0|9|10
Workshop Practices|Theory|2|100112|2|0|0|118|119
Swatch Bharat Mission|Practical|1|100115P|0|0|2|6|-
Engineering Physics Lab|Practical|1|100110P|0|0|2|11|-
Programming for Problem Solving Lab|Practical|1|100111P|0|0|2|12|-
Basic Electrical Engineering Lab|Practical|1|100106P|0|0|2|14|-
Workshop Practices Lab|Practical|1|100112P|0|0|2|120|-
#2
Engineering Chemistry|Theory|3|100215|3|0|0|121|16
Engineering Mathematics– II|Theory|4|100202|3|1|0|122|18
Communicative English|Theory|3|100216|3|0|0|19|123
Sports/Yoga/NCC/NSS|Practical|1|100220P|0|0|2|124|-
Basic Electronics|Theory|3|100209|3|0|0|125|126
Engineering Graphics and Design|Theory|1|100217|1|0|0|127|128
Engineering Chemistry Lab|Practical|1|100215P|0|0|2|26|-
Communicative English Lab|Practical|1|100216P|0|0|2|129|-
Basic Electronics Lab|Practical|1|100209P|0|0|2|130|-
Engineering Graphics and Design Lab|Practical|2|100217P|0|0|4|131|-
#3
Electronic Devices and Circuit Theory|Theory|3|104301|3|0|0|132|133
Object Oriented Programming|Theory|3|104302|3|0|0|134|135
Network Theory|Theory|4|104303|3|1|0|136|137
Signal & System|Theory|3|104304|3|0|0|138|139
Engineering Mathematics-III (PDE, Prob/stat)|Theory|4|104305|3|1|0|140|141
Universal Human Values|Theory|3|104306|3|0|0|41|-
Indian Knowledge System|Theory|0|104307|3|0|0|42|142
Electronic Devices and Circuit Theory Lab|Practical|1|104301P|0|0|2|143|-
Object Oriented Programming Lab|Practical|1|104302P|0|0|2|144|-
Internship – I|Practical|2|104308|0|0|0|48|-
#4
Digital Circuits|Theory|3|EC104|3|1|0|145|146
Analog Circuits|Theory|3|EC105|3|0|0|147|148
Semiconductor Physics And Devices|Theory|3|EC106|3|0|0|149|150
Analog Communication|Theory|3|EC107|3|0|0|151|152
Electromagnetic Theory|Theory|3|EC108|3|1|0|153|154
#5
Digital Signal Processing|Theory|3|EC109|3|0|0|155|156
Digital Signal Processing Lab|Theory|1|EC109P|0|0|2|157|-
Microprocessors And Microcontrollers|Theory|3|EC110|3|0|0|158|159
Linear Control Systems|Theory|4|EC111|3|1|0|160|161
Linear Integrated Circuits And Applications|Theory|3|EC112|3|0|0|162|163
Probability Theory And Stochastic Process|Theory|3|EC113|3|0|0|164|165
Computer Networks And Security|Theory|3|ES114|3|0|0|166|167`,
  ee: `Electrical Engineering
#1
Engineering Physics|Theory|3|100110|3|0|0|116|117
Engineering Mathematics–I|Theory|4|100102|3|1|0|2|3
Programming for Problem Solving|Theory|3|100111|3|0|0|4|5
Basic Electrical Engineering|Theory|3|100106|3|0|0|9|10
Workshop Practices|Theory|2|100112|2|0|0|118|119
Swatch Bharat Mission|Practical|1|100115P|0|0|2|6|-
Engineering Physics Lab|Practical|1|100110P|0|0|2|11|-
Programming for Problem Solving Lab|Practical|1|100111P|0|0|2|12|-
Basic Electrical Engineering Lab|Practical|1|100106P|0|0|2|14|-
Workshop Practices Lab|Practical|1|100112P|0|0|2|120|-
#2
Engineering Chemistry|Theory|3|100215|3|0|0|121|16
Engineering Mathematics– II|Theory|4|100202|3|1|0|122|18
Communicative English|Theory|3|100216|3|0|0|19|123
Sports/Yoga/NCC/NSS|Practical|1|100220P|0|0|2|124|-
Basic Electronics|Theory|3|100209|3|0|0|125|126
Engineering Graphics and Design|Theory|1|100217|1|0|0|127|128
Engineering Chemistry Lab|Practical|1|100215P|0|0|2|26|-
Communicative English Lab|Practical|1|100216P|0|0|2|129|-
Basic Electronics Lab|Practical|1|100209P|0|0|2|130|-
Engineering Graphics and Design Lab|Practical|2|100217P|0|0|4|131|-
#3
Electrical Circuit Analysis|Theory|4|103301|3|1|0|168|169
Analog Electronics|Theory|4|103302|3|1|0|170|171
Electrical Machine-1|Theory|4|103303|3|1|0|172|-
Engineering Mathematics-III (PDE, Prob/stat)|Theory|4|103304|3|1|0|140|173
Engineering Mechanics|Theory|4|103305|3|1|0|174|175
Universal Human Values|Theory|3|103306|3|0|0|176|-
Indian Knowledge System|Theory|0|103307|3|0|0|42|142
Electrical Circuit Analysis Lab|Practical|1|103301P|0|0|2|177|-
Analog Electronics Lab|Practical|1|103302P|0|0|2|178|-
Electrical Machine-I Lab|Practical|1|103303P|0|0|2|179|-
Internship – I|Practical|2|103308|0|0|0|48|-
#4
Analog Electronics|Theory|3|PCC-EEE06|3|0|0|180|181
Analog Electronics Laboratory|Theory|1|PCC-EEE07|0|0|2|182|-
Electrical Machines - II|Theory|3|PCC-EEE08|3|0|0|183|184
Electrical Machines Laboratory - II|Theory|1|PCC-EEE09|0|0|2|185|-
Microprocessors|Theory|3|PCC-EEE10|3|0|0|186|-
Digital Electronics and Microprocessor|Theory|1|PCC-EEE11|0|0|2|187|-
Signals and Systems|Theory|3|PCC-EEE12|2|1|0|188|189
Mathematics - III(Probability and|Theory|4|BSC 401|3|1|0|190|191
Biology - I|Theory|3|X-BIOLOGY-I|2|1|0|192|-
HSMC Elective Courses|Theory|3|X-HSMC-ELECTIVE-COURSES|3|0|0|-|-
Environmental Science|Theory|0|X-ENVIRONMENTAL-SCIENCE|3|0|0|-|-
Capstone Design Project|Theory|0|X-CAPSTONE-DESIGN-PROJEC|3|0|0|-|-
NCC / NSS / other Clubs & Society|Theory|0|X-NCC-NSS-OTHER-CLUBS-SO|3|0|0|-|-
#5
Analog & Digital Communication System|Theory|4|PCC-EEE19|3|0|2|193|-
Capstone Design Project|Theory|0|X-CAPSTONE-DESIGN-PROJEC|3|0|0|-|-
Constitution of India/ Essence of Indian|Theory|0|MC 501|3|0|0|194|-
Control Systems|Theory|4|PCC-EEE15|3|0|2|195|196
MOOCs / SWAYAM / NPTEL Courses - 2|Theory|2|X-MOOCS-SWAYAM-NPTEL-COU|2|0|0|-|-
Power Electronics|Theory|4|PCC-EEE17|3|0|2|197|198
Power Systems - I (Apparatus and Modelling)|Theory|4|PCC-EEE13|3|0|2|199|200
Professional Elective Laboratory - 1|Theory|1|X-PROFESSIONAL-ELECTIVE-|0|0|2|-|-
Summer Entrepreneurship - II|Theory|6|X-SUMMER-ENTREPRENEURSHI|0|0|12|-|-
PCC-EEE14 Power Systems - I Lab|Theory|1|X-PCC-EEE14-POWER-SYSTEM|0|0|2|201|-`,
  mech: `Mechanical Engineering
#1
Engineering Chemistry|Theory|3|100101|3|0|0|202|203
Engineering Mathematics–I|Theory|4|100102|3|1|0|2|204
Communicative English|Theory|3|100103|3|0|0|19|205
Sports/Yoga/NCC/NSS|Practical|1|100109P|0|0|2|21|-
Engineering Graphics and Design|Theory|1|100104|1|0|0|127|206
Basic Electrical Engineering|Theory|3|100106|3|0|0|207|10
Engineering Chemistry Lab|Practical|1|100101P|0|0|2|208|-
Communicative English Lab|Practical|1|100103P|0|0|2|27|-
Engineering Graphics and Design Lab|Practical|2|100104P|0|0|4|209|-
Basic Electrical Engineering Lab|Practical|1|100106P|0|0|2|210|-
#2
Engineering Physics|Theory|3|100201|3|0|0|211|212
Engineering Mathematics– II|Theory|4|100202|3|1|0|17|18
Programming for Problem Solving|Theory|3|100203|3|0|0|213|214
Workshop Practices|Theory|2|100206|2|0|0|215|216
Elements of Mechanical Engineering|Theory|3|100204|3|0|0|217|218
Engineering Physics Lab|Practical|1|100201P|0|0|2|11|-
Programming for Problem Solving Lab|Practical|1|100203P|0|0|2|12|-
Workshop Practices Lab|Practical|1|100206P|0|0|2|120|-
Elements of Mechanical Engineering Lab|Practical|1|100204P|0|0|2|219|-
#3
Engineering Mechanics|Theory|4|102301|3|1|0|220|221
Material Science and Engineering|Theory|3|102302|3|0|0|222|-
Engineering Mathematics-III (PDE, Prob/stat)|Theory|4|102303|3|1|0|223|173
Thermodynamics|Theory|3|102304|3|0|0|224|225
Basic Electronics Engineering|Theory|3|102305|3|0|0|226|227
Universal Human Values|Theory|3|102306|3|0|0|228|-
Indian Knowledge System|Theory|0|102307|3|0|0|42|142
Engineering Mechanics Lab|Practical|1|102301P|0|0|2|229|-
Basic Electronic Engineering Lab|Practical|1|102305P|0|0|2|230|-
Internship – I|Practical|2|102308|0|0|0|231|-
#4
Fluid Mechanics|Theory|4.5|PCC-ME 203|3|0|3|232|233
Applied Thermodynamics|Theory|4|PCC-ME 204|3|1|0|234|235
Strength of Materials|Theory|4.5|PCC-ME 205|3|0|3|236|237
Engineering Materials|Theory|4|PCC-ME 206|3|0|0|238|239
Instrumentation & Control|Theory|4|PCC-ME 207|3|0|0|240|241
Environmental Science|Theory|0|X-ENVIRONMENTAL-SCIENCE|2|0|0|-|-
#5
Heat Transfer|Theory|4.5|PCC-ME 301|3|0|3|242|243
Fluid Machinery|Theory|4.5|PCC-ME 302|3|0|3|244|245
Manufacturing Processes|Theory|4.5|PCC-ME 303|3|0|3|246|247
Kinematics of Machine|Theory|4|PCC-ME 304|3|1|0|248|249
Constitution of India / Essence of Indian|Theory|0|X-CONSTITUTION-OF-INDIA-|3|0|0|-|-
Summer Entrepreneurship-II|Theory|6|X-SUMMER-ENTREPRENEURSHI|0|0|12|-|-
Open Elective- I (MOOCs / SWAYAM / NPTEL|Theory|3|X-OPEN-ELECTIVE-I-MOOCS-|3|0|0|-|-
Graduate Employability Skills and|Theory|0|X-GRADUATE-EMPLOYABILITY|3|0|0|-|-
#6
Design of Machine Elements|Theory|3|102601|3|0|0|250|251
Dynamics of Machinery|Theory|3|102602|3|0|0|252|253
Manufacturing Technology|Theory|3|102603|3|0|0|254|255
Automation in Manufacturing|Theory|3|102605|3|0|0|256|257
Process Planning and Cost Estimation|Theory|3|102606|3|0|0|258|259|e
Power Plant Engineering|Theory|3|102610|3|0|0|260|261|e
Microprocessors in Automation|Theory|3|102608|3|0|0|262|263|e
Mechatronics Systems|Theory|3|102607|3|0|0|264|265|e
Composite Materials|Theory|3|102609|3|0|0|266|267|e
Renewable Energy Systems (Open Elective I)|Theory|3|102611|3|0|0|268|269
Design of Machine Elements Lab|Practical|1|102601P|0|0|2|270|-
Dynamics of Machinery Lab|Practical|1.5|102602P|0|0|3|271|-
Manufacturing Technology Lab|Practical|1.5|102603P|0|0|3|272|-
Automation in Manufacturing Lab|Practical|1|102605P|0|0|2|273|-`,
  civil: `Civil Engineering
#1
Engineering Chemistry|Theory|3|100101|3|0|0|202|203
Engineering Mathematics–I|Theory|4|100102|3|1|0|2|204
Communicative English|Theory|3|100103|3|0|0|19|205
Sports/Yoga/NCC/NSS|Practical|1|100109P|0|0|2|21|-
Engineering Graphics and Design|Theory|1|100104|1|0|0|127|206
Engineering Mechanics|Theory|3|100105|3|0|0|274|275
Engineering Chemistry Lab|Practical|1|100101P|0|0|2|208|-
Communicative English Lab|Practical|1|100103P|0|0|2|27|-
Engineering Graphics and Design Lab|Practical|2|100104P|0|0|4|209|-
Engineering Mechanics Lab|Practical|1|100105P|0|0|2|276|-
#2
Engineering Physics|Theory|3|100201|3|0|0|277|212
Engineering Mathematics– II|Theory|4|100202|3|1|0|17|18
Programming for Problem Solving(PPS)|Theory|3|100203|3|0|0|213|278
Workshop|Theory|1|100211|1|0|0|279|216
Basic Electrical Engineering|Theory|3|100212|3|0|0|280|10
Engineering Physics Lab|Practical|1|100201P|0|0|2|11|-
Programming for Problem Solving Lab|Practical|1|100203P|0|0|2|12|-
Workshop Practices Lab|Practical|1|100211P|0|0|2|120|-
Basic Electrical Engineering Lab|Practical|1|100212P|0|0|2|210|-
Swatch Bharat Mission|Practical|1|100214P|0|0|2|281|-
#3
Solid Mechanics|Theory|3|101301|3|0|0|282|283
Engineering Mathematics-III (PDE, Prob/stat)|Theory|4|101302|3|1|0|284|173
Universal Human Values|Theory|3|101303|3|0|0|285|-
Surveying and Geomatics|Theory|3|101304|3|0|0|286|287
Fluid Mechanics|Theory|3|101305|3|0|0|288|289
Materials, Testing & Evaluation|Theory|3|101306|3|0|0|290|291
Indian Knowledge System|Theory|0|101307|3|0|0|42|142
Solid Mechanics Lab|Practical|1|101301P|0|0|2|292|-
Surveying and Geomatics Lab|Practical|1|101304P|0|0|2|293|-
Fluid Mechanics Lab|Practical|1|101305P|0|0|2|294|-
Materials, Testing & Evaluation Lab|Practical|1|101306P|0|0|2|295|-
Internship – I|Practical|2|101308|0|0|0|48|-
#4
Mechanical Engineering|Theory|3|ESC 209|2|1|0|296|297
Engineering Geology|Theory|3|PCC CE 202|2|0|2|298|299
Disaster Preparedness & Planning|Theory|2|PCC CE 203|1|1|0|300|301
Introduction to Fluid Mechanics|Theory|4|PCC CE 204|3|0|2|302|303
Introduction to Solid Mechanics|Theory|3|PCC CE 205|3|0|0|304|305
Structural Analysis|Theory|4|PCC CE 208|3|1|0|306|307
Materials, Testing & Evaluation|Theory|3|PCC CE 207|1|1|2|308|309
Civil Engineering - Societal & Global|Theory|2|HSMC 252|2|0|0|310|311
Open Elective-I (Humanities) MOOC|Theory|2|X-OPEN-ELECTIVE-I-HUMANI|2|0|0|-|-
Management I (Organizational|Theory|0|X-MANAGEMENT-I-ORGANIZAT|3|0|0|-|-
#5
Mechanics of Materials|Theory|3|PCC CE 301|3|0|0|312|313
Hydraulic Engineering|Theory|3|PCC CE 302|2|0|2|314|315
Analysis and Design of Concrete|Theory|3|PCC CE 303|2|1|0|316|317
Geotechnical Engineering -I|Theory|4|PCC CE 304|3|0|2|318|319
Hydrology & Water Resources|Theory|3|PCC CE 305|2|0|2|320|321
Environmental Engineering -I|Theory|4|PCC CE 306|3|0|2|322|323
Transportation Engineering|Theory|4|PCC CE 307|3|0|2|324|325
Environmental Science|Theory|0|MC 401|3|0|0|326|-
Summer Entrepreneurship-II|Theory|6|X-SUMMER-ENTREPRENEURSHI|0|0|12|-|-
#6
Construction Engineering & Management|Theory|3|101602|3|0|0|327|328
Design of Steel Structure|Theory|3|101603|2|1|0|329|330
Engineering Economics, Estimation & Costing|Theory|2|101604|2|0|0|331|332
Environmental Engineering-II|Theory|3|101605|3|0|0|333|334
Geotechnical Engineering -II|Theory|3|101606|3|0|0|335|336
Energy Science & Engineering|Theory|3|101607|3|0|0|337|338|e
Construction Productivity|Theory|3|101608|3|0|0|339|340|e
Environmental Systems|Theory|3|101611|3|0|0|341|342|e
Design of Hydraulic Structures/Irrigation Engineering|Theory|3|101612|3|0|0|343|344|e
Reliability Analysis of Structures|Theory|3|101614|3|0|0|345|346|e
Concrete Materials|Theory|3|101617|3|0|0|347|348|e
Structural Analysis – I|Theory|3|101618|3|0|0|349|350|e
Soil Mechanics – I|Theory|3|101619|3|0|0|351|352|e
Transportation Economics|Theory|3|101620|3|0|0|353|354|e
Infrastructure Planning and Design|Theory|3|101621|3|0|0|355|356|e
Repair & Rehabilitation of Structures|Theory|3|101622|3|0|0|357|358|e
Airport Planning and Design|Theory|3|101623|3|0|0|359|360|e
High Speed Rail Engineering|Theory|3|101624|3|0|0|361|362|e
Engineering Economics, Estimation & Costing Lab|Practical|1|101604P|0|0|2|363|-
NPTEL Courses-2|Practical|2|100604P|0|0|4|-|-`,
  eee: `Electrical & Electronics Engineering
#1
Engineering Physics|Theory|3|100110|3|0|0|116|117
Engineering Mathematics–I|Theory|4|100102|3|1|0|2|3
Programming for Problem Solving|Theory|3|100111|3|0|0|4|5
Basic Electrical Engineering|Theory|3|100106|3|0|0|9|10
Workshop Practices|Theory|2|100112|2|0|0|118|119
Swatch Bharat Mission|Practical|1|100115P|0|0|2|6|-
Engineering Physics Lab|Practical|1|100110P|0|0|2|11|-
Programming for Problem Solving Lab|Practical|1|100111P|0|0|2|12|-
Basic Electrical Engineering Lab|Practical|1|100106P|0|0|2|14|-
Workshop Practices Lab|Practical|1|100112P|0|0|2|120|-
#2
Engineering Chemistry|Theory|3|100215|3|0|0|121|16
Engineering Mathematics– II|Theory|4|100202|3|1|0|122|18
Communicative English|Theory|3|100216|3|0|0|19|123
Sports/Yoga/NCC/NSS|Practical|1|100220P|0|0|2|124|-
Basic Electronics|Theory|3|100209|3|0|0|125|126
Engineering Graphics and Design|Theory|1|100217|1|0|0|127|128
Engineering Chemistry Lab|Practical|1|100215P|0|0|2|26|-
Communicative English Lab|Practical|1|100216P|0|0|2|129|-
Basic Electronics Lab|Practical|1|100209P|0|0|2|130|-
Engineering Graphics and Design Lab|Practical|2|100217P|0|0|4|131|-
#3
Electrical Circuit Analysis|Theory|4|110301|3|1|0|168|169
Digital Electronics|Theory|4|110302|3|1|0|364|365
Engineering Mathematics-III (PDE, Prob/stat)|Theory|4|110303|3|1|0|140|141
Electromagnetic Field Theory|Theory|4|110304|3|1|0|366|367
Signals and Systems|Theory|3|110305|3|0|0|368|139
Universal Human Values|Theory|3|110306|3|0|0|176|-
Indian Knowledge System|Theory|0|110307|3|0|0|42|142
Electrical Circuit Analysis Lab|Practical|1|110301P|0|0|2|177|-
Digital Electronics Lab|Practical|1|110302P|0|0|2|369|-
Internship – I|Practical|2|110308|0|0|0|370|-
#6
Digital Signal Processing|Theory|3|100606|3|0|0|371|372
Introduction to VLSI Design|Theory|3|100607|3|0|0|373|374
Professional Skill Development|Theory|3|100608|3|0|0|375|376
Measurements and Instrumentation|Theory|3|110601|3|0|0|377|378
Advanced Electric Drives|Theory|3|110602|3|0|0|379|380|e
Electrical Energy Conservation and Auditing|Theory|3|110608|3|0|0|381|382|e
Computer Architecture|Theory|3|100611|3|0|0|383|384|e
Digital Image & Video Processing|Theory|3|100614|3|0|0|385|-|e
Computational Electromagnetics|Theory|3|110603|3|0|0|386|387|e
Electrical Machine Design|Theory|3|110609|3|0|0|388|389|e
Digital Control Systems|Theory|3|100612|3|0|0|390|391|e
Electrical Drives|Theory|3|100613|3|0|0|392|393|e
Digital Signal Processing Lab|Practical|1|100606P|0|0|2|394|-
Introduction to VLSI Design Lab|Practical|1|100607P|0|0|2|395|-
Electronics Design Laboratory|Practical|1|100609P|0|0|2|396|397
Measurements and Instrumentation Lab|Practical|1|110601P|0|0|2|398|-
Power Systems-II Lab|Practical|1|103601P|0|0|2|-|-`,
};

export const GATE_WIRE: Record<string, string> = {
  "CS": `Computer Science & Information Technology
Section 1: Engineering Mathematics|399
Section 2: Digital Logic|400
Section 3: Computer Organization and Architecture|401
Section 4: Programming and Data Structures|402
Section 5: Algorithms|403
Section 6: Theory of Computation|404
Section 7: Compiler Design|405
Section 8: Operating System|406
Section 9: Databases|407
Section 10: Computer Networks|408`,
  "CE": `Civil Engineering
Section 1: Engineering Mathematics|409
Section 2: Structural Engineering|410
Section 3: Geotechnical Engineering|411
Section 4: Water Resources Engineering|412
Section 5: Environmental Engineering|413
Section 6: Transportation Engineering|414
Section 7: Geomatics Engineering|415`,
  "EE": `Electrical Engineering
Section 1: Engineering Mathematics|416
Section 2: Electric circuits|417
Section 3: Electromagnetic Fields|418
Section 4: Signals and Systems|419
Section 5: Electrical Machines|420
Section 6: Power Systems|421
Section 7: Control Systems|422
Section 8: Electrical and Electronic Measurements|423
Section 9: Analog and Digital Electronics|424
Section 10: Power Electronics|425`,
  "EC": `Electronics & Communication Engineering
Section 1: Engineering Mathematics|426
Section 2: Networks, Signals and Systems|427
Section 3: Electronic Devices|428
Section 4: Analog Circuits|429
Section 5: Digital Circuits|430
Section 6: Control Systems|431
Section 7: Communications|432
Section 8: Electromagnetics|433`,
  "ME": `Mechanical Engineering
Section 1: Engineering Mathematics|434
Section 2: Applied Mechanics and Design|435
Section 3: Fluid Mechanics and Thermal Sciences|436
Section 4: Materials, Manufacturing and Industrial Engineering|437`,
  "DA": `Data Science & Artificial Intelligence
Probability and Statistics|438
Linear Algebra|439
Calculus and Optimization|440
Programming, Data Structures and Algorithms|441
Database Management and Warehousing|442
Machine Learning|443
AI|444`,
  "AE": `Aerospace Engineering
Section 1: Engineering Mathematics|445
Section 2: Flight Mechanics|446
Section 3: Space Dynamics|447
Section 4: Aerodynamics|448
Section 5: Structures|449
Section 6: Propulsion|450`,
  "GG": `Geology & Geophysics
Part-A: Common Section|451
Part-B (B1): Geology|452
Part-B (B2): Geophysics|453`,
  "AG": `Agricultural Engineering
Section 1: Engineering Mathematics|454
Section 2: Farm Machinery|455
Section 3: Farm Power|456
Section 4: Soil and Water Conservation Engineering|457
Section 5: Irrigation and Drainage Engineering|458
Section 6: Agricultural Process Engineering|459
Section 7: Dairy and Food Engineering|460`,
  "IN": `Instrumentation Engineering
Section 1: Engineering Mathematics|461
Section 2: Electricity and Magnetism|418
Section 3: Electrical Circuits and Machines|462
Section 4: Signals and Systems|463
Section 5: Control Systems|464
Section 6: Analog Electronics|465
Section 7: Digital Electronics|466
Section 8: Measurements|467
Section 9: Sensors and Industrial Instrumentation|468
Section 10: Communication and Optical Instrumentation|469`,
  "AR": `Architecture and Planning
Section 1: Architecture, Planning and Design|470
Section 2: Construction and Management|471
Section 3: Environmental Planning and Design|472
Section 4: Urban Design, landscape and Conservation|473
Section 5: Planning process|474
Section 6: Housing|475
Section 7: Services and Infrastructure|476`,
  "MA": `Mathematics
Calculus|477
Linear Algebra|478
Real Analysis|479
Complex Analysis|480
Ordinary Differential Equations|481
Algebra|482
Functional Analysis|483
Numerical Analysis|484
Partial Differential Equations|485
Topology|486
Linear Programming|487`,
  "BM": `Biomedical Engineering
Engineering Mathematics|488
Electrical Circuits|489
Signals and Systems|490
Analog and Digital Electronics|491
Measurements and Control Systems|492
Sensors and Bioinstrumentation|493
Human Anatomy and Physiology|494
Medical Imaging Systems|495
Biomechanics|496
Biomaterials|497`,
  "BT": `Biotechnology
Section 1: Engineering Mathematics|498
Section 2: General Biology|499
Section 3: Genetics, Cellular and Molecular Biology|500
Section 4: Fundamentals of Biological Engineering|501
Section 5: Bioprocess Engineering and Process Biotechnology|502
Section 6: Plant, Animal and Microbial Biotechnology|503
Section 7: Recombinant DNA technology and Other Tools in Biotechnology|504`,
  "MN": `Mining Engineering
Section 1: Engineering Mathematics|505
Section 2: Mining Geology, Mine Development and Surveying|506
Section 3: Geomechanics and Ground Control|507
Section 4: Mining Methods and Machinery|508
Section 5: Surface Environment, Mine Ventilation and Underground Hazards|509
Section 6: Mineral Economics, Mine Planning, Systems Engineering|510`,
  "MT": `Metallurgical Engineering
Section 1: Engineering Mathematics|511
Section 2: Metallurgical Thermodynamics|512
Section 3: Transport Phenomena and Rate Processes|513
Section 4: Mineral Processing and Extractive Metallurgy|514
Section 5: Physical Metallurgy|515
Section 6: Mechanical Metallurgy|516
Section 7: Manufacturing Processes|517`,
  "CH": `Chemical Engineering
Section 1: Engineering Mathematics|518
Section 2: Process Calculations and Thermodynamics|519
Section 3: Fluid Mechanics and Mechanical Operations|520
Section 4: Heat Transfer|521
Section 5: Mass Transfer|522
Section 6: Chemical Reaction Engineering|523
Section 7: Instrumentation and Process Control|524
Section 8: Plant Design and Economics|525
Section 9: Chemical Technology|526`,
  "NM": `Naval Architecture & Marine Engineering
Section 1: Engineering Mathematics|527
Section 2: Applied Mechanics and Structures|528
Section 3: Fluid Mechanics and Marine Hydrodynamics|529
Section 4: Naval Architecture and Ocean Engineering|530
Section 5: Thermodynamics and Marine Engineering|531`,
  "PE": `Petroleum Engineering
Linear Algebra|532
Calculus|533
Differential Equations|534
Complex Variables|535
Probability and Statistics|536
Numerical Methods|537
Petroleum Exploration|538
Oil and Gas Well Drilling Technology|539
Reservoir Engineering|540
Petroleum Production Operations|541
Offshore Drilling and Production Practices|542
Petroleum Formation Evaluation|543
Oil and Gas Well Testing|544
Health Safety and Environment in Petroleum Industry|545
Enhanced Oil Recovery Techniques|546
Latest Trends in Petroleum Engineering|547`,
  "CY": `Chemistry
Section 1: Physical Chemistry|548
Section 2: Inorganic Chemistry|549
Section 3: Organic Chemistry|550`,
  "PH": `Physics
Section 1: Mathematical Physics|551
Section 2: Classical Mechanics|552
Section 3: Electromagnetic Theory|553
Section 4: Quantum Mechanics|554
Section 5: Thermodynamics and Statistical Physics|555
Section 6: Atomic and Molecular Physics|556
Section 7: Solid State Physics|557
Section 8: Electronics|558
Section 9: Nuclear and Particle Physics|559`,
  "PI": `Production & Industrial Engineering
Section 1: Engineering Mathematics|560
Section 2: General Engineering|561
Section 3: Manufacturing Processes I|562
Section 4: Manufacturing Processes II|563
Section 5: Quality and Reliability|564
Section 6: Industrial Engineering|565
Section 7: Operations research and Operations management|566`,
  "ST": `Statistics
Calculus|567
Matrix Theory|568
Probability|569
Standard Discrete and Continuous Univariate Distributions|570
Stochastic Processes|571
Estimation|572
Testing of Hypotheses|573
Non-parametric Statistics|574
Multivariate Analysis|575
Regression Analysis|576`,
  "TF": `Textile Engineering & Fibre Science
Section 1: Textile Fibres|577
Section 2: Yarn Manufacture, Yarn Structure and Properties|578
Section 3: Fabric Manufacture, Structure and Properties|579
Section 4: Textile Testing|580
Section 5: Chemical Processing|581`,
  "ES": `Environmental Science & Engineering
Section 1: Mathematics Foundation|582
Section 2: Environmental Chemistry|583
Section 3: Environmental Microbiology|584
Section 4: Water Resources and Environmental Hydraulics|585
Section 5: Water & Wastewater Treatment and Management|586
Section 6: Air and Noise Pollution|587
Section 7: Solid and Hazardous Waste Management|588
Section 8: Global and Regional Environmental Issues|589
Section 9: Environmental Management and Sustainable Development|590`,
  "XE": `Engineering Sciences
Section 1: Linear Algebra|591
Section 2: Calculus|592
Section 3: Vector Calculus|593
Section 4: Complex variables|594
Section 5: Ordinary Differential Equations|595
Section 6: Partial Differential Equations|596
Section 7: Probability and Statistics|597
Section 8: Numerical Methods|598
Section 1: Flow and Fluid Properties|599
Section 2: Kinematics of Fluid Motion|600
Section 3: Integral Analysis for a Control Volume|601
Section 4: Differential Analysis|602
Section 5: Dimensional Analysis|603
Section 6: Internal Flows|604
Section 7: Bernoulli’s Equation and its Applications, Potential Flows|605
Section 8: External Flows|606
Section 1: Classification and Structure of Materials|607
Section 2: Thermodynamics, Kinetics and Phase Transformations|608
Section 3: Properties and Applications of Materials|609
Section 4: Characterization and Measurements of Properties|610
Section 5: Processing of Materials|611
Section 6: Degradation of Materials|612
Section 1: Mechanics of rigid bodies|613
Section 2: Mechanics of deformable bodies|614
Section 3: Vibrations|615
Section 1: Basic Concepts|616
Section 2: First Law of Thermodynamics|617
Section 3: Second Law of Thermodynamics|618
Section 4: Properties of Pure Substances|619
Section 5: Thermodynamic Relations|620
Section 6: Thermodynamic Cycles|621
Section 7: Ideal Gas Mixtures|622
Section 1: Chemistry of High Polymers|623
Section 2: Polymer Characterization|624
Section 3: Synthesis, Manufacturing and Properties|625
Section 4: Polymer Blends and Composites|626
Section 5: Polymer Technology|627
Section 6: Polymer Rheology|628
Section 7: Polymer Processing|629
Section 8: Polymer Testing|630
Section 9: Polymer Recycling and Waste management|631
Section 1: Food Chemistry and Nutrition|632
Section 2: Food Microbiology|633
Section 3: Food Products Technology|634
Section 4: Food Engineering|635
Section 1: Energy Resources and Conversion Technologies|636
Section 2: Energy Storage, Economics, Environment, and Efficiency|637`,
  "EY": `Ecology and Evolution
Section 1: Ecology|638
Section 2: Evolution|639
Section 3: Mathematics and Quantitative Ecology|640
Section 4: Behavioural Ecology|641
Section 5: Applied Ecology & Evolution|642`,
  "XH": `Humanities & Social Sciences
XH-B1 Reasoning and Comprehension (Compulsory for all XH candidates)|643
XH-C1 Economics|644
XH-C2 English|645
XH-C3 Linguistics|646
XH-C4 Philosophy|647
XH-C5 Psychology|648
XH-C6 Sociology|649`,
  "GE": `Geomatics Engineering
Part-A (Common): Engineering Mathematics and Basic Geomatics|650
Part-B1: Surveying and Mapping|651
Part-B2: Image Processing and Analysis|652`,
  "XL": `Life Sciences
Section 1: Atomic Structure and Periodicity|653
Section 2: Structure and Bonding|654
Section 3: s, p and d Block Elements|655
Section 4: Chemical Equilibria|656
Section 5: Electrochemistry|657
Section 6: Reaction Kinetics|658
Section 7: Thermodynamics|659
Section 8: Structure-Reactivity Correlations and Organic Reaction Mechanisms|660
Section 9: Chemistry of Biomolecules|661
Section 1: Plant Systematics|662
Section 2: Plant Anatomy|663
Section 3: Plant Development; Cell and Tissue Morphogenesis|664
Section 4: Plant Physiology and Biochemistry|665
Section 5: Genetics and Genomics|666
Section 6: Plant Breeding, Genetic Modification, Genome Editing|667
Section 7: Economic and Applied Botany|668
Section 8: Plant Pathology|669
Section 9: Ecology and Environment|670
Section 1: Historical Perspective|671
Section 2: Methods in Microbiology|672
Section 3: Microbial Taxonomy and Diversity|673
Section 4: Prokaryotic Cells: Structure and Function|674
Section 5: Microbial Growth|675
Section 6: Control of Micro-organisms|676
Section 7: Microbial Metabolism|677
Section 8: Microbial Diseases and Host Pathogen Interaction|678
Section 9: Chemotherapy/Antibiotics|679
Section 10: Microbial Genetics|680
Section 11: Microbial Ecology|681
Section 1: Animal Diversity|682
Section 2: Evolution|683
Section 3: Genetics|684
Section 4: Biochemistry and Molecular Biology|685
Section 5: Cell Biology|686
Section 6: Gene expression in Eukaryotes|687
Section 7: Animal Anatomy and Physiology|688
Section 8: Parasitology and Immunology|689
Section 9: Development Biology|690
Section 10: Ecology|691
Section 11: Animal Behaviour|692
Section 1: Food Chemistry and Nutrition|693
Section 2: Food Microbiology|694
Section 3: Food Products Technology|695
Section 4: Food Engineering|696`,
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
