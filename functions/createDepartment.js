//===================================CREATE NEW DEPARTMENT FUNCTION===========================================
const mongoose = require('mongoose')
const DepartmentModel = require('../models/department')

async function createDepartment(name) {
    try {
        let department = new DepartmentModel({
            name
        })
        await department.save()
        console.log("Отдел создан")    
    } catch (error) {
        console.log('Произошла ошибка: ', error);
    }
}
module.exports = createDepartment