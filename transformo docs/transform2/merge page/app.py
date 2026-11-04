from flask import Flask, request, jsonify, render_template
import pandas as pd

app = Flask(__name__)

# Adjusted dataset with 30 policies
policies = pd.DataFrame({
    'Policy': [
        'Ayushman Bharat PM-JAY', 'Star Health Senior Citizen Plan',
        'Care Health Insurance Joy Plan', 'HDFC Health Suraksha', 
        'ICICI Lombard Complete Health', 'Religare Care Health Plan', 
        'Max Bupa Health Companion', 'Tata AIG MediCare', 
        'Aditya Birla Activ Health', 'Bajaj Allianz Health Guard',
        'New India Assurance Mediclaim', 'Oriental Insurance Happy Family',
        'Star Health Family Health Optima', 'SBI Arogya Premier', 
        'ManipalCigna Health Insurance', 'Future Generali Health Total', 
        'Bharti AXA Health AdvantEdge', 'HDFC Ergo Health Insurance',
        'Kotak Health Shield', 'SBI Health Insurance', 
        'Religare Care Freedom', 'ManipalCigna ProHealth', 
        'Max Bupa Health Recharge', 'ICICI Lombard Health Advantage', 
        'Tata AIG MediRaksha', 'Aditya Birla Health Enhancer', 
        'Bajaj Allianz Family Floater', 'HDFC Ergo Optima Restore',
        'Future Generali Health Total', 'Kotak Health Shield'
    ],
    'Age_Group': [
        (0, 60), (60, 120), (25, 45), (18, 70), (0, 100), (0, 75),
        (0, 65), (0, 60), (30, 50), (0, 80), (0, 50), (0, 100),
        (0, 65), (0, 60), (18, 65), (30, 75), (0, 100), (0, 70),
        (18, 65), (0, 60), (25, 75), (30, 65), (0, 70), (0, 100),
        (0, 75), (18, 70), (0, 65), (25, 80), (0, 100), (0, 75)
    ],
    'Income_Limit': [
        20000, 1000000, 1000000, 500000, 2000000, 1500000, 
        1200000, 1000000, 3000000, 2500000, 400000, 600000, 
        800000, 1000000, 500000, 900000, 1500000, 2000000, 
        2500000, 3000000, 500000, 4000000, 1000000, 800000, 
        1200000, 900000, 1100000, 5000000, 3000000, 2000000
    ],
    'Covers_PreMeds': [
        0, 1, 0, 0, 1, 0, 
        0, 1, 0, 1, 0, 1, 
        0, 1, 1, 0, 1, 0, 
        1, 0, 1, 0, 0, 1, 
        1, 0, 1, 1, 0, 1
    ],
    'Gender_Specific': [
        'None', 'None', 'Female', 'Male', 'None', 'None',
        'None', 'None', 'None', 'None', 'None', 'None', 
        'None', 'None', 'None', 'None', 'None', 'None',
        'None', 'None', 'None', 'None', 'None', 'None',
        'None', 'None', 'None', 'None', 'None', 'None'
    ],
    'Other_Features': [
        'Government Scheme', 'Senior Citizens', 'Maternity Benefits', 
        'Comprehensive Coverage', 'Cashless Treatment', 'Pre-Post Hospitalization',
        'Daycare Procedures', 'Domiciliary Treatment', 'Ambulance Cover', 
        'Lifelong Renewability', 'Alternative Treatments', 'Organ Donor Expenses',
        'Health Checkups', 'Mental Health Support', 'Wellness Programs',
        'Global Coverage', 'Personal Accident Cover', 'Family Floater Option',
        'No Sub-Limits', 'Comprehensive Coverage', 'Daycare Treatments',
        'Home Healthcare', 'Health Risk Assessment', 'Nursing Care',
        'Pre-Existing Disease Coverage', 'Maternity Coverage', 'OPD Expenses',
        'Critical Illness Rider', 'Annual Health Checkup', 'No Claim Bonus'
    ]
})

# Feature Weights
weights = {
    'Age': 0.2,
    'Salary': 0.3,
    'PreMeds': 0.4,
    'Gender': 0.1
}

@app.route('/', methods=['GET'])
def index():
    return render_template("main.html")

# Function to calculate a score for each policy
def calculate_policy_score(policy, user_input, weights):
    score = 0
    age_min, age_max = policy['Age_Group']
    if age_min <= user_input['Age'] <= age_max:
        score += weights['Age'] * 1
    else:
        score += weights['Age'] * 0

    if user_input['Salary'] <= policy['Income_Limit']:
        score += weights['Salary'] * 1
    else:
        score += weights['Salary'] * 0

    if user_input['PreMeds'] == policy['Covers_PreMeds']:
        score += weights['PreMeds'] * 1
    else:
        score += weights['PreMeds'] * 0

    if policy['Gender_Specific'] == 'None' or policy['Gender_Specific'] == user_input['Gender']:
        score += weights['Gender'] * 1
    else:
        score += weights['Gender'] * 0

    return score

# API to handle user inputs and return recommended policies
@app.route('/recommend', methods=['POST'])
def recommend():
    user_input = request.json
    policies['Score'] = policies.apply(lambda policy: calculate_policy_score(policy, user_input, weights), axis=1)
    recommended_policies = policies.sort_values(by='Score', ascending=False).head(3)
    
    return recommended_policies[['Policy', 'Score']].to_dict(orient='records')

if __name__ == '__main__':
    app.run(debug=True)
