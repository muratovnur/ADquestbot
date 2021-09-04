require('dotenv').config();
require('./functions/connectDB')()

const axios = require('axios')
const fs = require('fs')
const { DateTime } = require("luxon");
const { Telegraf, session, Scenes: { WizardScene, BaseScene, Stage}, Markup, Telegram } = require('telegraf');

//IMPORT MODELS=======================================
const UserModel = require('./models/user');
const TaskModel = require('./models/task');
const DepartmentModel = require('./models/department');
const ChecklistModel = require('./models/checklist');


//IMPORT FUNCTIONS====================================
//const getUser = require('./functions/getUser')



//---------------------------KEYBOARDS----------------------------------
const exit_keyboard = Markup.keyboard([ 'Выход' ]).oneTime().resize()

const task_list_keyboard = () => {
    return Markup.keyboard([['Создать задание', 'Выход']]).resize()
}
const edit_status_keyboard = Markup.keyboard([ 'Выполнено', 'Не выполнено', 'На проверке']).oneTime().resize()
const remove_keyboard = Markup.removeKeyboard()


//=======================================================================
const departments_list_keyboard = (departments) => {
    let names = departments.map( department => {return department.name})

    return Markup.keyboard(names).oneTime();
}
//--------------------------------------------------------------------------------------------------------
const excuse_inline_keyboard = (telegramId) => Markup.inlineKeyboard([
    [ Markup.button.callback('Разрешить', `allow:${telegramId}}`), Markup.button.callback('Отказать', `decline:${telegramId}`) ],
]);

const task_list_inline_keyboard = (task) => Markup.inlineKeyboard([
    [ Markup.button.callback('Посмотреть детали', `viewDetailsAdmin:${task._id}`)],
    [ Markup.button.callback('Редактировать задание', `editTaskAdmin:${task._id}`), Markup.button.callback('Удалить задание', `deleteTask:${task._id}`) ],
]);

const task_edit_inline_keyboard = (task_id) => Markup.inlineKeyboard([
    [ Markup.button.callback('Название', `editField:${task_id}:title`), Markup.button.callback('Комментарий', `editField:${task_id}:comment`)],
    [ Markup.button.callback('Исполнитель', `editField:${task_id}:maker`), Markup.button.callback('Срок выполнения', `editField:${task_id}:deadline`)],
    [ Markup.button.callback('Статус', `editField:${task_id}:title`), Markup.button.callback('Удалить задание', `deleteTask:${task_id}`)],
    [ Markup.button.callback('Отмена', `cancel:${task_id}`)],
]);

const task_full_inline_keyboard = (task) => Markup.inlineKeyboard([
    [ Markup.button.callback('Скрыть детали', `hide:${task._id}`) ],
    [ Markup.button.callback('Редактировать задание', `editTaskAdmin:${task._id}`), Markup.button.callback('Удалить задание', `deleteTask:${task._id}`) ],
]);


//===========================================USER KEYBOARDS======================================================
const user_task_list_inline_keyboard = (task) => Markup.inlineKeyboard([
    [ Markup.button.callback('Редактировать задание', `editTask:${task._id}`), Markup.button.callback('Посмотреть детали', `viewDetails:${task._id}`) ]
]);

const user_task_full_inline_keyboard = (task) => Markup.inlineKeyboard([
    [ Markup.button.callback('Редактировать задание', `editTask:${task._id}`), Markup.button.callback('Назад', `back:${task._id}`) ],
]);

const user_task_done_inline_keyboard = (task) => Markup.inlineKeyboard([
    [ Markup.button.callback('Выполнено', `markAsDone:${task._id}`), Markup.button.callback('Назад', `back:${task._id}`) ],
]);

const user_task_undone_inline_keyboard = (task) => Markup.inlineKeyboard([
    [ Markup.button.callback('Не выполнено', `markAsUndone:${task._id}`), Markup.button.callback('Назад', `back:${task._id}`) ],
]);


//================================================INFO SCENE=====================================
const nameHandler = Telegraf.on('text', async ctx => {
    ctx.session.name = ctx.message.text

    await ctx.reply('Введите, пожалуйста, вашу фамилию')

    return ctx.wizard.next()
})


const surNameHandler = Telegraf.on('text', async ctx => {
    ctx.session.surName = ctx.message.text

    ctx.session.departmentsAccessible = await DepartmentModel.find().select('name -_id');

    await ctx.reply('Укажите ваш отдел', departments_list_keyboard(ctx.session.departmentsAccessible))

    return ctx.wizard.next()
})


const departmentHandler = Telegraf.on('text', async ctx => {
    let departments = await DepartmentModel.find({name: ctx.message.text})
    if (departments.length) {
    ctx.session.department = ctx.message.text

    await createUser(ctx.session.telegramId, ctx.session.name, ctx.session.surName, ctx.session.department)
    await ctx.reply('Спасибо! Информация сохранена!', remove_keyboard)

    ctx.session.user = await UserModel.findOne({telegramId: ctx.session.telegramId})
    ctx.scene.enter('User')
    } else {
        ctx.reply('Такого отдела не нашлось, попробуйте ввести ваш отдел еще раз', departments_list_keyboard(ctx.session.departmentsAccessible))
        return ctx.wizard.selectStep(ctx.wizard.cursor)
    }
})


const infoScene = new WizardScene('infoScene', nameHandler, surNameHandler, departmentHandler);

infoScene.enter(ctx => ctx.reply('Введите, пожалуйста, ваше имя'));


//EXCUSE BASE SCENE=====================================================================================
const excuseScene = new BaseScene('excuseScene');

excuseScene.enter(ctx => {
    console.log("excusiiiiiiiiiiing");
})

excuseScene.on('text', async ctx => {
    let from = ctx.message.text.split(" ")
    let target = await UserModel.find({name: from[0], surName: from[1], role: 'LocalAdmin'})

    if (!target.length)
        target = await UserModel.find({name: from[0], surName: from[1], role: 'SuperAdmin'})
    
    if (target.length)
        await ctx.telegram.sendMessage(target[0].telegramId, `${ctx.session.user.name} ${ctx.session.user.surName} хочет отпроситься`, excuse_inline_keyboard(ctx.session.user.telegramId))
    else {
        await ctx.reply('Такой пользователь не найден, попробуйте еще раз')
        return ctx.scene.reenter()
    }

    ctx.reply('Ваша заявка отправлена', exit_keyboard);
    ctx.scene.enter('User')
})


//BASE SCENE USER===============================================
const User = new BaseScene('User');

User.enter(async ctx => {
    if (ctx.session.firstEnter) {
        ctx.session.firstEnter = 0
        ctx.reply(`Приветствую, ${ctx.session.user.name}! Ваш статус: Пользователь.\n
Список доступных команд:\n
/mytasks - Показать список моих заданий
/excuse - Отпроситься у руководителя
/checkin - Регистрация начала работы
/checkout - Регистрация конца работы
/givetaskassistant - Выдача задания для вашего ассистента (если у вас имеется ассистент)
/menu - Показать все команды бота`)
    }
})

User.command('/mytasks', async (ctx) => {
    const tasks = await TaskModel.find().populate('maker').populate('author');
    let userTasks = [];
    tasks.map(task => {
        if (JSON.stringify(task.maker._id) === JSON.stringify(ctx.session.user._id)) {
            userTasks.push(task);
        }
    })
    if (userTasks.length === 0) return ctx.reply('На данный момент у вас нет заданий')
    await ctx.reply('Ваши задания');

    userTasks.forEach(task => {
        ctx.reply(`Название: ${task.title}\nАвтор: ${task.author.name} ${task.author.surName}\nСрок выполнения: ${task.deadline.toLocaleString(DateTime.DATETIME_SHORT)}\nСтатус: ${task.status}`, user_task_list_inline_keyboard(task));
    })
})

User.command('/excuse', async ctx => {
    await ctx.reply('Введите Имя и Фамиилию вашего руководителя', exit_keyboard)
    return ctx.scene.enter('excuseScene')
})

User.command('/givetaskassistant', async ctx => {
    const curUser = await UserModel.findOne({telegramId: ctx.session.user.telegramId})
    if (curUser.directAssistant.length) {
        await ctx.reply('Начинаю процесс создания задания для ассистента')
        ctx.scene.enter('createTaskScene')
    }
    else if (curUser.directAssistant.length == 0) {
        await ctx.reply('У вас нет назначенного ассистента')
    }
    else {
        await ctx.reply('Выберите пожалуйста одну из команд или /menu чтобы посмотреть список доступных команд')
    }
})

User.action(/^viewDetails:.*/, async ctx => {
    const id = ctx.callbackQuery.data.split(":")[1];
    const task = await TaskModel.findOne({_id: `${id}`}).populate('author')

    ctx.editMessageText(`Название: ${task.title}\nАвтор: ${task.author.name} ${task.author.surName}\nСрок выполнения: ${task.deadline.toLocaleString(DateTime.DATETIME_SHORT)}\nСтатус: ${task.status}\nКомментарий: ${task.comment}`, user_task_full_inline_keyboard(task));
})

User.action(/^markAsDone:.*/, async ctx => {
    const id = ctx.callbackQuery.data.split(":")[1];
    
    await TaskModel.findOneAndUpdate({ _id: id }, {status: "Выполнено"}, {new: true}, (err, data) => {
        if(err) console.log(err);
        else console.log(data);
    });
    let task = await TaskModel.findOne({_id: `${id}`}).populate('author')
    
    ctx.editMessageText(`Название: ${task.title}\nАвтор: ${task.author.name} ${task.author.surName}\nСрок выполнения: ${task.deadline.toLocaleString(DateTime.DATETIME_SHORT)}\nСтатус: ${task.status}`, user_task_list_inline_keyboard(task));
})

User.action(/^markAsUndone:.*/, async ctx => {
    const id = ctx.callbackQuery.data.split(":")[1];
    
    await TaskModel.findOneAndUpdate({ _id: id }, {status: "Не выполнено"}, {new: true}, (err, data) => {
        if(err) console.log(err);
        else console.log(data);
    });
    let task = await TaskModel.findOne({_id: `${id}`}).populate('author')
    
    ctx.editMessageText(`Название: ${task.title}\nАвтор: ${task.author.name} ${task.author.surName}\nСрок выполнения: ${task.deadline.toLocaleString(DateTime.DATETIME_SHORT)}\nСтатус: ${task.status}`, user_task_list_inline_keyboard(task));
})

User.action(/^back:.*/, async ctx => {
    const id = ctx.callbackQuery.data.split(":")[1];
    
    let task = await TaskModel.findOne({_id: `${id}`}).populate('author')
    
    ctx.editMessageText(`Название: ${task.title}\nАвтор: ${task.author.name} ${task.author.surName}\nСрок выполнения: ${task.deadline.toLocaleString(DateTime.DATETIME_SHORT)}\nСтатус: ${task.status}`, user_task_list_inline_keyboard(task));
})


//BASE SCENE LOCAL ADMIN=====================================================
const LocalAdmin = new BaseScene('LocalAdmin');


LocalAdmin.enter(async ctx => {
    if (ctx.session.firstEnter) {
        ctx.session.firstEnter = 0
        ctx.reply('Приветствую! Ваш статус: Локальный Администратор\nВведите команду "/menu" для просмотра доступных вам команд.', task_list_keyboard())
    }
});


LocalAdmin.command('/mytasks', async (ctx) => {
    const tasks = await TaskModel.find().populate('maker').populate('author');
    let userTasks = []
    tasks.map(task => {
        if (JSON.stringify(task.maker._id) === JSON.stringify(ctx.session.user._id)) {
            userTasks.push(task)
        }
    })
    console.log(userTasks);
    if (userTasks.length === 0) return ctx.reply('На данный момент у вас нет заданий')
    await ctx.reply('Ваши задания');

    userTasks.forEach(task => {
        ctx.reply(`Название: ${task.title}\nАвтор: ${task.author.name} ${task.author.surName}\nСрок выполнения: ${task.deadline.toLocaleString(DateTime.DATETIME_SHORT)}\nСтатус: ${task.status}`, user_task_list_inline_keyboard(task));
    })
})


LocalAdmin.command('/tasks', async ctx => {
    const tasks = await TaskModel.find({department: `${ctx.session.user.department}`}).populate('maker');

    await ctx.reply('Список всех заданий вашего отдела', task_list_keyboard())

    tasks.forEach(task => {
        ctx.reply(`Название: ${task.title}\nАвтор: ${task.maker.name}\nСрок выполнения: ${task.deadline.toLocaleString(DateTime.DATETIME_SHORT)}\nСтатус: ${task.status}`, task_list_inline_keyboard(task));
    })
});


LocalAdmin.command('/appendAssistant', async ctx => {
    ctx.scene.enter('appendAssistantScene')
})


LocalAdmin.action(/^viewDetailsAdmin:.*/, async ctx => {
    const id = ctx.callbackQuery.data.split(":")[1];
    const task = await TaskModel.findOne({_id: `${id}`}).populate('author').populate('maker')

    ctx.editMessageText(`Название: ${task.title}\nАвтор: ${task.author.name} ${task.author.surName}\nСрок выполнения: ${task.deadline.toLocaleString(DateTime.DATETIME_SHORT)}\nСтатус: ${task.status}\nИсполнитель: ${task.maker.name} ${task.maker.surName}\nКомментарий: ${task.comment}`, task_full_inline_keyboard(task));
})


LocalAdmin.action(/^hide:.*/, async ctx => {
    const id = ctx.callbackQuery.data.split(":")[1];
    
    let task = await TaskModel.findOne({_id: `${id}`}).populate('maker')
    
    ctx.editMessageText(`Название: ${task.title}\nАвтор: ${task.maker.name}\nСрок выполнения: ${task.deadline.toLocaleString(DateTime.DATETIME_SHORT)}\nСтатус: ${task.status}`, task_list_inline_keyboard(task));
})


LocalAdmin.action(/^editTaskAdmin:.*/, async ctx => {
    const task_id = ctx.callbackQuery.data.split(":")[1];
    console.log(task_id);
    ctx.session.taskToEditId = task_id
    console.log(ctx.session.taskToEditId);
    
    return ctx.scene.enter('editTaskScene')
})


LocalAdmin.action(/^allow:.*/, async ctx => {
    const telegramId = ctx.callbackQuery.data.split(":")[1];
    
    await ctx.telegram.sendMessage(telegramId, `Ваша заявка одобрена`)
})


LocalAdmin.action(/^decline:.*/, async ctx => {
    const telegramId = ctx.callbackQuery.data.split(":")[1];
    
    await ctx.telegram.sendMessage(telegramId, `Ваша заявка не одобрена`)
})


LocalAdmin.hears('Создать задание', ctx => {
    ctx.scene.enter('createTaskScene')
});


LocalAdmin.hears('Выход', ctx => {
    ctx.reply(`Выхожу из "Создания задания"`);

    ctx.scene.enter('LocalAdmin');
});
//==================================TASK SCENE SUPER ADMIN=====================================================
const SuperAdmin = new BaseScene('SuperAdmin');


SuperAdmin.enter(async ctx => {
    await ctx.reply('Супер Админ')
    if (ctx.session.firstEnter) {
        ctx.session.firstEnter = 0
        ctx.reply(`Приветствую! Ваш статус: Глобальный Администратор\nВведите команду "/menu" для просмотра доступных вам команд.`, task_list_keyboard())
    }
});


SuperAdmin.command('/tasks',async ctx => {
    const tasks = await TaskModel.find().populate('maker');

    await ctx.reply('Список всех заданий', task_list_keyboard())

    tasks.forEach(task => {
        ctx.reply(`Название: ${task.title}\nИсполнитель: ${task.maker.name}\nОтдел: ${task.department}\nСрок выполнения: ${task.deadline.toLocaleString(DateTime.DATETIME_SHORT)}\nСтатус: ${task.status}`, task_list_inline_keyboard(task));
    })
});


SuperAdmin.command('/mytasks', async (ctx) => {
    const tasks = await TaskModel.find().populate('maker').populate('author');

    let userTasks = []

    tasks.map(task => {
        if (JSON.stringify(task.maker._id) === JSON.stringify(ctx.session.user._id)) {
            userTasks.push(task)
        }
    })

    console.log(userTasks);
    if (userTasks.length === 0) return ctx.reply('На данный момент у вас нет заданий')
    await ctx.reply('Ваши задания');

    userTasks.forEach(task => {
        ctx.reply(`Название: ${task.title}\nАвтор: ${task.author.name} ${task.author.surName}\nСрок выполнения: ${task.deadline.toLocaleString(DateTime.DATETIME_SHORT)}\nСтатус: ${task.status}`, ask_list_inline_keyboard(task));
    })
})


SuperAdmin.action(/^viewDetailsAdmin:.*/, async ctx => {
    const id = ctx.callbackQuery.data.split(":")[1];
    const task = await TaskModel.findOne({_id: `${id}`}).populate('author').populate('maker')

    ctx.editMessageText(`Название: ${task.title}\nИсполнитель: ${task.maker.name} ${task.maker.surName}\nОтдел: ${task.department}\nСрок выполнения: ${task.deadline.toLocaleString(DateTime.DATETIME_SHORT)}\nСтатус: ${task.status}\nКомментарий: ${task.comment}\nАвтор: ${task.author.name} ${task.author.surName}`, task_full_inline_keyboard(task));
})


SuperAdmin.action(/^hide:.*/, async ctx => {
    const id = ctx.callbackQuery.data.split(":")[1];
    const task = await TaskModel.findOne({_id: `${id}`}).populate('maker')
    
    ctx.editMessageText(`Название: ${task.title}\nИсполнитель: ${task.maker.name}\nОтдел: ${task.department}\nСрок выполнения: ${task.deadline.toLocaleString(DateTime.DATETIME_SHORT)}\nСтатус: ${task.status}`, task_list_inline_keyboard(task));
})


SuperAdmin.action(/^editTaskAdmin:.*/, async ctx => {
    const task_id = ctx.callbackQuery.data.split(":")[1];
    
    console.log(task_id);
    ctx.session.taskToEditId = task_id
    console.log(ctx.session.taskToEditId);
    
    return ctx.scene.enter('editTaskScene')
})


SuperAdmin.action(/^allow:.*/, async ctx => {
    const telegramId = ctx.callbackQuery.data.split(":")[1];
    
    await ctx.telegram.sendMessage(telegramId, `Ваша заявка одобрена`)
})


SuperAdmin.action(/^decline:.*/, async ctx => {
    const telegramId = ctx.callbackQuery.data.split(":")[1];
    
    await ctx.telegram.sendMessage(telegramId, `Ваша заявка не одобрена`)
})


SuperAdmin.hears('Создать задание', ctx => {
    ctx.scene.enter('createTaskScene')
});


SuperAdmin.hears('Выход', ctx => {
    ctx.reply(`Выхожу из "Создания задания"`);

    ctx.scene.enter(`${ctx.session.user.role}`)
});


//APPEND ASSISTANT WIZARD SCENE=================================
const targetUser = Telegraf.on('text', async ctx => {
    let targetUserInput = ctx.message.text.split(" ")
    let targetUserId = await UserModel.findOne({name: targetUserInput[0], surName: targetUserInput[1], department: ctx.session.user.department}).select('_id')
    
    console.log(targetUserId);

    if (targetUserId) {
        ctx.session.targetUserId = targetUserId
        await ctx.reply('Введите сотрудника которого хотите назначить ассистентом')
        return ctx.wizard.next()
    }
    else {
        await ctx.reply('Такой пользователь не найден, попробуйте еще раз')
        return ctx.wizard.selectStep(ctx.wizard.cursor)
    }
})


const appendUser = Telegraf.on('text', async ctx => {
    let appendUserInput = ctx.message.text.split(" ")
    let appendUser = await UserModel.findOne({name: appendUserInput[0], surName: appendUserInput[1], department: ctx.session.user.department})
    
    if (appendUser) {
        try {
            await UserModel.findOneAndUpdate({_id: ctx.session.targetUserId}, {$push: {directAssistant: appendUser._id}}, {new: true})
            await ctx.reply(`Операция прошла успешно!`)
            return ctx.scene.enter(`${ctx.session.user.role}`)
        } catch (error) {
            console.log(error);
            await ctx.reply('Что-то пошло не так, попробуйте еще раз')
            return ctx.wizard.selectStep(ctx.wizard.cursor)
        }
    }
    else {
        await ctx.reply('Такой пользователь не найден, попробуйте еще раз')
        return ctx.wizard.selectStep(ctx.wizard.cursor)
    }
})


const appendAssistantScene = new WizardScene('appendAssistantScene', targetUser, appendUser)


appendAssistantScene.enter(async ctx => {
    await ctx.reply('Введите имя и фамилию сотрудника к которому хотите прикрепить ассистента')
})


//EDIT TASK BASE SCENE===================================================================
const editTaskScene = new BaseScene('editTaskScene')


editTaskScene.enter(async ctx => {
    const task = await TaskModel.findOne({_id: ctx.session.taskToEditId}).populate('maker').populate('author');
    
    ctx.editMessageText(`Название: ${task.title}\nИсполнитель: ${task.maker.name} ${task.maker.surName}\nОтдел: ${task.department}\nСрок выполнения: ${task.deadline.toLocaleString(DateTime.DATETIME_SHORT)}\nСтатус: ${task.status}\nКомментарий: ${task.comment}\nАвтор: ${task.author.name} ${task.author.surName}\n
Выберите параметр который хотите редактировать`, task_edit_inline_keyboard(ctx.session.taskToEditId));
})


editTaskScene.action(/^editField:.*/, async ctx => {
    ctx.session.editField = ctx.callbackQuery.data.split(":")[2]
    ctx.reply('Введите новую информацию')
})


editTaskScene.action(/^cancel:.*/, async ctx => {
    const task = await TaskModel.findOne({_id: ctx.session.taskToEditId}).populate('maker')

    ctx.editMessageText(`Название: ${task.title}\nИсполнитель: ${task.maker.name}\nОтдел: ${task.department}\nСрок выполнения: ${task.deadline.toLocaleString(DateTime.DATETIME_SHORT)}\nСтатус: ${task.status}`, task_list_inline_keyboard(task));
    ctx.reply('Выполняется отмена')
    ctx.scene.enter(`${ctx.session.user.role}`)
})


editTaskScene.action(/^deleteTask:.*/, async ctx => {
    const id = ctx.callbackQuery.data.split(":")[1];
    const task = await TaskModel.findOne({_id: id})

    ctx.reply(`Задание под названием ${task.title} удалено`)

    await TaskModel.findByIdAndDelete(id)
    ctx.scene.enter(`${ctx.session.user.role}`)
})


editTaskScene.on('text', async ctx => {
    let updatedData = ctx.message.text

    const id = ctx.session.taskToEditId
    try {
        switch (ctx.session.editField) {
            case 'title':
                updateInfo = {title: updatedData}
    
                console.log(updateInfo);
    
                await editTask(id, updateInfo);
    
                ctx.reply('Изменения для поля "Название" сохранены', remove_keyboard)
    
                break;
            case 'comment':
                updateInfo = {comment: updatedData}
    
                console.log(updateInfo);
    
                await editTask(id, updateInfo);
    
                ctx.reply('Изменения для поля "Комментарий" сохранены', remove_keyboard)
    
                break;
            case 'maker':
                updatedData = updatedData.split(" ")
                const maker = await UserModel.find({name: updatedData[0], surName: updatedData[1]}).select('_id')
                console.log(maker);
                if (maker.length) {
                    updateInfo = maker[0]
    
                    console.log("THis is updateinfo",updateInfo);
    
                    await editTaskMaker(id, updateInfo);
    
                    ctx.reply('Изменения для поля "Исполнитель" сохранены', remove_keyboard)
    
                }
                else {
                    await ctx.reply('Такой пользователь не найден, попробуйте еще раз')
                    return ctx.wizard.selectStep(ctx.wizard.cursor)
                }
                break;
            case 'deadline':
                updateInfo = {deadline: updatedData}
    
                console.log(updateInfo);
    
                await editTask(id, updateInfo);
    
                ctx.reply('Изменения для поля "Срок выполнения" сохранены', remove_keyboard)
    
                break;
            case 'status':
                updateInfo = {status: updatedData}
    
                console.log(updateInfo);
    
                await editTask(id, updateInfo);
    
                ctx.reply('Изменения для поля "Статус" сохранены', remove_keyboard)
    
                break;
            default:
                ctx.reply('Совпадения имени поля не найдены, попробуйте еще раз или нажмите кнопку "Выход" чтобы выйти', exit_keyboard)
                //return ctx.scene.reenter()
        }
    } catch (error) {
        await ctx.reply('Ой, что-то пошло не так')
    }
    
    ctx.scene.enter(`${ctx.session.user.role}`)
})


//EDIT TASK FUNCTIONS===============================================
async function editTask(id, updateInfo) {
    await TaskModel.findOneAndUpdate({ _id: id }, {$set: updateInfo}, {new: true}, (err, data) => {
        if(err) console.log(err);
        else console.log(data);
    });
}


async function editTaskMaker(id, updateInfo) {
    const task = await TaskModel.findOne({ _id: id }).populate('maker')
    const newMaker = await UserModel.findOne({ _id: updateInfo._id })

    task.maker = newMaker

    await task.save()
    // await TaskModel.findOneAndUpdate({ _id: id }, {$set: updateInfo}, {new: true}, (err, data) => {
    //     if(err) console.log(err);
    //     else console.log(data);
    // });
}


//CREATE TASK WIZARD SCENE==================================================================
const createTaskTitle = Telegraf.on('text', async ctx => {
    ctx.session.title = ctx.message.text
    
    await ctx.reply('Введите комментарий к заданию', exit_keyboard)

    return ctx.wizard.next()
})


const createTaskComment = Telegraf.on('text', async ctx => {
    ctx.session.comment = ctx.message.text

    let departmentsAccessible = [];

    if (ctx.session.user.role === "SuperAdmin") {
        departmentsAccessible = await DepartmentModel.find().select('name -_id');
    }
    else {
        console.log("skipping departmnet");
        ctx.session.department = ctx.session.user.department

        await ctx.reply('Введите имя и фамилию исполнителя задания, например "Иван Иванов".', exit_keyboard)

        return ctx.wizard.selectStep(ctx.wizard.cursor + 2)
    }
    await ctx.reply('Укажите отдел к которому относится задание', departments_list_keyboard(departmentsAccessible))
    
    return ctx.wizard.next()
})


const createTaskDepartment = Telegraf.on('text', async ctx => {
    console.log("entering create department");
    let department = ctx.message.text
    
    let departmentIsFound = await DepartmentModel.findOne({name: department})

    console.log("Department search result: ", departmentIsFound);
    if (departmentIsFound) {
        ctx.session.department = department

        await ctx.reply('Введите имя и фамилию исполнителя задания, например "Иван Иванов".', exit_keyboard)
        return ctx.wizard.next()
    }
    else {
        await ctx.reply('Такой отдел не был найден, попробуйте еще раз', exit_keyboard)
        return ctx.wizard.selectStep(ctx.wizard.cursor)
    }   
})


const createTaskMaker = Telegraf.on('text', async ctx => {
    const msg = ctx.message.text.split(" ") 

    if (msg.length !== 2) {
        await ctx.reply('Неправильный ввод, попробуйте еще раз. Введите Имя и Фамилию исполнителя задания, например: "Иван Иванов". ')

        return ctx.wizard.selectStep(ctx.wizard.cursor)
    }

    let found = []

    if (ctx.session.user.role === 'LocalAdmin') {
        found = await UserModel.find({name: msg[0], surName: msg[1], department: ctx.session.user.department});
    } 
    else {
        found = await UserModel.find({name: msg[0], surName: msg[1], department: ctx.session.department});
    }

    if (found.length) {
        await UserModel.find({name: msg[0], surName: msg[1]}).lean().exec(function(error, record) {
            record.forEach(function(res) {
                ctx.session.maker = res._id;    
            });
          });
    }
    //ПРОВЕРИТЬ ЕСЛИ ПОЛЬЗОВАТЕЛЕЙ С ОДИНАКОВЫМИ ИМЕНЕМ И ФАМИЛИЕЙ БОЛЬШЕ ОДНОГО
    else {
        await ctx.reply('Пользователь не найден попробуйте еще раз')

        return ctx.wizard.selectStep(ctx.wizard.cursor)
    }

    await ctx.reply('Введите конечный срок выполнения задания в формате: ГОД/МЕСЯЦ/ДЕНЬ ЧАС:МИНУТ:СЕКУНД. Например: 2000/01/17 18:30:00', exit_keyboard)

    return ctx.wizard.next()
})


const createTaskDeadline = Telegraf.on('text', async ctx => {
    try {
        if (ctx.message.text === 'Выход')
            ctx.scene.enter(`${ctx.session.user.role}`)

        let [date, time] = ctx.message.text.split(" ")

        date = date.split('/')
        time = time.split(':')
        
        let dateTest = DateTime.fromObject({year: date[0], month: date[1], day: date[2], hour: time[0], minute: time[1], second: time[2]}).toISO()

        if (DateTime.now().toISO() >= dateTest) {
            await ctx.reply('Вы указали прошедшую дату, попробуйте еще раз')
            return ctx.wizard.selectStep(ctx.wizard.cursor)
        }

        ctx.session.deadline = ctx.message.text
        try {
            let task = new TaskModel({
                title: ctx.session.title,
                comment: ctx.session.comment,
                department: ctx.session.department,
                author: ctx.session.user._id,
                maker: ctx.session.maker,
                deadline: ctx.session.deadline,
            });
    
            await task.save();
    
            await UserModel.findOneAndUpdate({ _id: ctx.session.maker }, {$push: {tasks: task}}, {new: true})    
        } 
        catch (error) {
            console.log(error);
            await ctx.reply('Что-то пошло не так, попробуйте еще раз')
            await ctx.reply('Введите конечный срок выполнения задания в формате: ГОД/МЕСЯЦ/ДЕНЬ ЧАС:МИНУТ:СЕКУНД. Например: 2000/01/17 18:30:00', exit_keyboard)
            return ctx.wizard.selectStep(ctx.wizard.cursor)
        }
    } 
    
    catch (error) {
        console.log(error);
        await ctx.reply('Что-то пошло не так, попробуйте еще раз')
        await ctx.reply('Введите конечный срок выполнения задания в формате: ГОД/МЕСЯЦ/ДЕНЬ ЧАС:МИНУТ:СЕКУНД. Например: 2000/01/17 18:30:00', exit_keyboard)
        return ctx.wizard.selectStep(ctx.wizard.cursor)
    }
    
    await ctx.reply('Задание успешно создано!')
    
    return ctx.scene.enter(`${ctx.session.user.role}`)
})


const createTaskScene = new WizardScene('createTaskScene', createTaskTitle, createTaskComment, createTaskDepartment, createTaskMaker, createTaskDeadline);

createTaskScene.enter(ctx => {
    ctx.reply('Введите название задания', exit_keyboard)
})

//===========================CHECK IN/OUT SCENES==========================================
const checkInScene = new BaseScene('checkInScene');

checkInScene.enter(async ctx => {
    const day = DateTime.now().day
    const month = DateTime.now().month
    const year = DateTime.now().year
    const checkin = await ChecklistModel.findOne({telegramId: ctx.session.user.telegramId, came: true, day: day, month: month, year: year})

    if (checkin) {
        ctx.reply('Вы уже совершали вход')
        return ctx.scene.enter(`${ctx.session.user.role}`)
    }

    await ctx.reply('Сделайте и отправьте, пожалуйста, своё фото', exit_keyboard)
});


checkInScene.on('photo', async ctx => {
    let date = ctx.message.date

    ctx.telegram.getFileLink(ctx.message.photo[0]).then(url => {    
        axios({url: `${url}`, responseType: 'stream'}).then(response => {
            return new Promise((resolve, reject) => {
                response.data.pipe(fs.createWriteStream(`./images/${ctx.from.first_name}_${ctx.from.id}_CAME.jpg`))
                            .on('finish', () => console.log('IMAGE IS SAVED'))
                            .on('error', e => console.log(e))
                    });
                })
    })

    date = DateTime.fromSeconds(date)

    let day = date.day
    let month = date.month
    let year = date.year

    date = date.toISO({zone: 'system'})

    let check = new ChecklistModel({
        telegramId: ctx.session.user.telegramId,
        checkIn: date,
        came: true,
        year,
        month,
        day
    })

    await check.save()
    await ctx.reply('Спасибо! Ваш вход зарегистрирован!')

    ctx.scene.enter(`${ctx.session.user.role}`)
})


checkInScene.on('text', async ctx => {
    await ctx.reply('Сделайте и отправьте, пожалуйста, своё фото', exit_keyboard)
})


const checkOutScene = new BaseScene('checkOutScene');

checkOutScene.enter(async ctx => {
    const day = DateTime.now().day
    const month = DateTime.now().month
    const year = DateTime.now().year
    const checkout = await ChecklistModel.findOne({telegramId: ctx.session.user.telegramId, left: true, day: day, month: month, year: year})

    if (checkout) {
        ctx.reply('Вы уже совершали вход')
        return ctx.scene.enter(`${ctx.session.user.role}`)
    }
    await ctx.reply('Сделайте и отправьте, пожалуйста, своё фото', exit_keyboard)
});


checkOutScene.on('photo', async ctx => {
    let date = ctx.message.date

    ctx.telegram.getFileLink(ctx.message.photo[0]).then(url => {    
        axios({url: `${url}`, responseType: 'stream'}).then(response => {
            return new Promise((resolve, reject) => {
                response.data.pipe(fs.createWriteStream(`./images/${ctx.from.first_name}_${ctx.update.message.from.id}_LEFT.jpg`))
                            .on('finish', () => console.log('IMAGE IS SAVED'))
                            .on('error', e => console.log(e))
                    });
                })
    })

    date = DateTime.fromSeconds(date)

    let day = date.day
    let month = date.month
    let year = date.year

    date = date.toISO({zone: 'system'})

    await ChecklistModel.findOneAndUpdate({telegramId: ctx.session.user.telegramId, day: day, month: month, year: year}, {checkOut: date, left: true},  {new: true}, (err, data) => {
        if(err) console.log(err);
        else console.log(data);
    });
    
    await ctx.reply('Спасибо! Ваш выход зарегистрирован!')
    ctx.scene.enter(`${ctx.session.user.role}`)
})


checkOutScene.on('text', async ctx => {
    await ctx.reply('Отправьте пожалуйста своё фото', exit_keyboard)
})


//STAGE DECLATAION=======================================================================
const stage = new Stage([ infoScene, User, LocalAdmin, SuperAdmin, createTaskScene, editTaskScene, excuseScene, checkInScene, checkOutScene, appendAssistantScene ]);


stage.hears('Выход', ctx => { 
    ctx.reply('Выхожу', remove_keyboard)
    ctx.scene.enter(`${ctx.session.user.role}`)
});


stage.action(/^editTask:.*/, async ctx => {
    const id = ctx.callbackQuery.data.split(":")[1];
    const task = await TaskModel.findOne({_id: `${id}`}).populate('author')

    if (task.status === 'Не выполнено')
        ctx.editMessageText(`Название: ${task.title}\nАвтор: ${task.author.name} ${task.author.surName}\nСрок выполнения: ${task.deadline.toLocaleString(DateTime.DATETIME_SHORT)}\nСтатус: ${task.status}`, user_task_done_inline_keyboard(task));
    else if ((task.status === 'Выполнено'))
        ctx.editMessageText(`Название: ${task.title}\nАвтор: ${task.author.name} ${task.author.surName}\nСрок выполнения: ${task.deadline.toLocaleString(DateTime.DATETIME_SHORT)}\nСтатус: ${task.status}`, user_task_undone_inline_keyboard(task));
    else if ((task.status === 'На проверке')) {
        ctx.reply('Нельзя редактировать статус задания на проверке')
        ctx.editMessageText(`Название: ${task.title}\nАвтор: ${task.author.name} ${task.author.surName}\nСрок выполнения: ${task.deadline.toLocaleString(DateTime.DATETIME_SHORT)}\nСтатус: ${task.status}`, user_task_list_inline_keyboard(task));
    }
})


stage.action(/^deleteTask:.*/, async ctx => {
    const id = ctx.callbackQuery.data.split(":")[1];
    const task = await TaskModel.findOne({_id: id})

    ctx.reply(`Задание под названием "${task.title}" со статусом "${task.status}" удалено`)

    await TaskModel.findByIdAndDelete(id)
})


//CREATE USER FUNCTION======================================
async function createUser(telegramId, name, surName, department) {
    try {
        let user = new UserModel({
            telegramId,
            name,
            surName,
            department
        });

        await user.save();    
    } 
    
    catch (error) {
        console.log('Произошла ошибка', error);
    }
}


//GET USER FUNCTION==========================================================================
async function getUser(telegramId) {
    try {
        return await UserModel.findOne({telegramId})
    } 

    catch (error) {
        console.log("Пользователь не найден, провожу регистрацию");
        return false
    }
}

//BOT INITIALIZTION==========================================================
const bot = new Telegraf(process.env.BOT_TOKEN)


bot.use(session(), stage.middleware())


bot.start(async (ctx) => {
    let user = await getUser(ctx.from.id);
    if (!user) {
        ctx.session.telegramId = ctx.from.id;
        ctx.session.firstEnter = 1
        //infoScene это сцена регистраций пользователя
        return ctx.scene.enter('infoScene');
    }
    
    ctx.session.user = user
    
    ctx.scene.enter(`${user.role}`)
})


bot.command('/menu', ctx => {
    try {
        if (ctx.session.user.role === 'User') {
            return ctx.reply(`Список доступных команд:
/start - Для начальной регистраций и инициализаций работы с ботом
/mytasks - Показать список моих заданий (после инициализаций)
/excuse - Отпроситься у руководителя
/checkin - Регистрация начала работы
/checkout - Регистрация конца работы
/givetaskassistant - Выдача задания для вашего ассистента (если у вас имеется ассистент)
/menu - Показать все команды бота`)
        }
        if (ctx.session.user.role === 'LocalAdmin') {
            return ctx.reply(`Список доступных команд:
/start - Для начальной регистраций и инициализаций работы с ботом
/mytasks - Показать список моих заданий (после инициализаций)
/tasks - Показать список всех заданий вашего отдела (после инициализаций)
/checkin - Регистрация начала работы
/checkout - Регистрация конца работы
/appendAssistant - Привязать ассистента к сотруднику
/menu - Показать все команды бота`)
        }
        else if (ctx.session.user.role === 'SuperAdmin'){
            return ctx.reply(`Список доступных команд:
/start - Для начальной регистраций и инициализаций работы с ботом
/mytasks - Показать список моих заданий (после инициализаций)
/tasks - Показать список всех заданий (после инициализаций)
/checkin - Регистрация начала работы
/checkout - Регистрация конца работы
/menu - Показать все команды бота`)
        }    
    } 
    
    catch (error) {
        console.log(error);
        return ctx.reply('Что-то пошло не так. попробуйте сначала команду /start')
    }
    
})


bot.command('/checkin', ctx => {
    if(!ctx.session.user)
        return ctx.reply('Что-то пошло не так, попробуйте сначала команду /start')

    return ctx.scene.enter('checkInScene')
})


bot.command('/checkout', ctx => {
    if(!ctx.session.user)
        return ctx.reply('Что-то пошло не так, попробуйте сначала команду /start')

    return ctx.scene.enter('checkOutScene')
})


bot.command('/info', ctx => {
    console.log(ctx.session);
    ctx.reply(`${ctx.session.user}, ${ctx.session.title}, ${ctx.session.comment}, ${ctx.session.maker}, ${ctx.session.deadline}`)
});


bot.on('text', async ctx => {
    let user = await getUser(ctx.from.id);
    console.log(user);
    if (!user) {
        ctx.session.firstEnter = 1
        ctx.session.telegramId = ctx.from.id;

        //infoScene это сцена регистраций пользователя
        return ctx.scene.enter('infoScene');
    }
    else {
        await ctx.reply('Выберите пожалуйста одну из команд или /menu чтобы посмотреть список доступных команд')
    }
});


bot.launch()

