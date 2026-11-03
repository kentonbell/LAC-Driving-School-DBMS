-- Apply after workspace.sql. Also used to restore the catalog after emptying a demo.
BEGIN;
CREATE FUNCTION install_school_catalog() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 UPDATE service SET public_key='lesson' WHERE public_key IS NULL
 AND service_id=(SELECT min(service_id) FROM service WHERE service_name='Class 5/7 driving lesson')
 AND NOT EXISTS(SELECT 1 FROM service WHERE public_key='lesson');
 INSERT INTO service(public_key,service_name,licence_class,duration_minutes,base_price) VALUES
 ('assessment','Assessment session','CLASS 5 / 7',60,70),
 ('lesson','In-car driving lesson','CLASS 5 / 7',90,100),
 ('extended','Extended driving lesson','CLASS 5 / 7',120,130),
 ('class4','Restricted licence lesson','CLASS 4',90,150),
 ('test150','Road test package','CLASS 5 / 7',150,200),
 ('test120','Road test package','CLASS 5 / 7',120,180),
 ('test180','Restricted road test package','CLASS 4',180,250),
 ('rental','Road test vehicle rental','CLASS 5 / 7',60,100),
 ('pretrip','Pre-trip practice','CLASS 4',30,50)
 ON CONFLICT(public_key) DO NOTHING;
 INSERT INTO package(service_id,package_name,number_of_lessons,package_price)
 SELECT s.service_id,n||'-lesson package',n,price FROM service s CROSS JOIN
 (VALUES(4,390),(6,580),(8,770),(10,960),(12,1150)) p(n,price)
 WHERE public_key='lesson' AND NOT EXISTS(SELECT 1 FROM package x WHERE x.service_id=s.service_id AND x.number_of_lessons=n);
END $$;
SELECT install_school_catalog();
COMMIT;
