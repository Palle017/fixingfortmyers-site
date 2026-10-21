import unittest
from beside_extract import extract, apply

class ExtractTests(unittest.TestCase):
    def test_labels(self):
        self.assertEqual(extract('AI recap\nVehicle: 2015 Honda Accord\nIssue: grinding brakes when stopping'),('2015 Honda Accord','grinding brakes when stopping'))
        self.assertEqual(extract('Reason for call - AC blowing warm')[1],'AC blowing warm')
    def test_year_make_mention(self):
        self.assertEqual(extract('Hi my 2012 ford F-150 will not start')[0],'2012 ford F-150')
    def test_nothing_inferred(self):
        self.assertEqual(extract('Call me back please'),('',''))
        self.assertEqual(extract('I have 2000 dollars'),('',''))
        self.assertEqual(extract(None),('',''))
    def test_apply_keeps_full_text_and_known_vehicle(self):
        item={'vehicle':'','concern':'Vehicle: 2019 Kia Soul\nIssue: check engine light'}
        out=apply(item)
        self.assertEqual(out['vehicle'],'2019 Kia Soul')
        self.assertTrue(out['concern'].startswith('Issue: check engine light\n\n'))
        self.assertIn('Vehicle: 2019 Kia Soul',out['concern'])
        self.assertEqual(apply({'vehicle':'Known','concern':'Vehicle: Other'})['vehicle'],'Known')
        self.assertEqual(apply(out)['concern'],out['concern'])
        self.assertEqual(item['vehicle'],'')

if __name__=='__main__':unittest.main()
