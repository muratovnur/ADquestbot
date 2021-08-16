require('dotenv').config();
const mongoose = require('mongoose');

const { Telegraf, session, Scenes: { WizardScene, BaseScene, Stage}, Markup } = require('telegraf');

const UserModel = require('./models/user');
const TaskModel = require('./models/task');
const task = require('./models/task');

mongoose.connect(process.env.DB_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useFindAndModify: false,
  useCreateIndex: true
})
.then(() => console.log('MongoDB is connected!'))
.catch(err => console.error(err));



//----------------EXIT KEYBOARD AND REMOVE OPTION-----------------------
const exit_keyboard = Markup.keyboard([ 'exit' ]).oneTime()
const remove_keyboard = Markup.removeKeyboard()




//---------------USER-START----------------------------
const nameHandler = Telegraf.on('text', async ctx => {
    ctx.session.name = ctx.message.text

    await ctx.reply('Ваша фамилия?', exit_keyboard)

    return ctx.wizard.next()
})

const surNameHandler = Telegraf.on('text', async ctx => {
    ctx.session.surName = ctx.message.text
    
    await ctx.reply('Укажите ваш департамент', exit_keyboard)

    return ctx.wizard.next()
})

const departmentHandler = Telegraf.on('text', async ctx => {
    
    ctx.session.department = ctx.message.text
    await createUser(ctx.session.telegramId, ctx.session.name, ctx.session.surName, ctx.session.department)
    await ctx.reply('Информация сохранена', remove_keyboard)

    return ctx.scene.leave()
})

const infoScene = new WizardScene('infoScene', nameHandler, surNameHandler, departmentHandler);
infoScene.enter(ctx => ctx.reply('Как ваше имя?', exit_keyboard));
//--------------------------------------------------------------------------------------------------------


//--------------------------------------------------------------------------------------------------------
const task_list_keyboard = () => Markup.inlineKeyboard([
    [ Markup.button.callback('Create Task', `createTask`) ],
    [ Markup.button.callback('Edit Task', `editTask`) ],
    [ Markup.button.callback('exit', `exit`) ],
]);

const taskScene = new BaseScene('taskScene');
taskScene.enter(ctx => ctx.reply('Your Tasks List', task_list_keyboard()));
taskScene.action('createTask', ctx => {
    ctx.scene.enter('createTaskScene')
});
taskScene.action('exit', ctx => {
    console.log(ctx.session.user);
    ctx.reply(`Выхожу из "Создания задания"`);
    ctx.scene.leave();
});
taskScene.on('text', ctx => ctx.reply('You are on task Scene'))
//--------------------------------------------------------------------------------------------------------


//--------------------------------------------------------------------------------------------------------
const createTaskTitle = Telegraf.on('text', async ctx => {
    ctx.session.title = ctx.message.text
    
    await ctx.reply('Укажите комментарий к заданию', exit_keyboard)

    return ctx.wizard.next()
})
const createTaskComment = Telegraf.on('text', async ctx => {
    ctx.session.comment = ctx.message.text
    
    await ctx.reply('Укажите выполнителя задания', exit_keyboard)

    return ctx.wizard.next()
})
const createTaskMaker = Telegraf.on('text', async ctx => {
    ctx.session.maker = ctx.message.text
    
    await ctx.reply('Укажите конечный срок выполнения задания', exit_keyboard)

    return ctx.wizard.next()
})
const createTaskDeadline = Telegraf.on('text', async ctx => {
    ctx.session.deadline = ctx.message.text
    
    await ctx.reply('Задание сохранено', exit_keyboard)

    return ctx.scene.leave()
})

const createTaskScene = new WizardScene('createTaskScene', createTaskTitle, createTaskComment, createTaskMaker, createTaskDeadline);
createTaskScene.enter(ctx => {
    console.log(ctx.session.user);
    ctx.reply('Укажите название задания', exit_keyboard)
})
//--------------------------------------------------------------------------------------------------------

const stage = new Stage([ infoScene, taskScene, createTaskScene ]);
stage.hears('exit', ctx => { 
    ctx.reply('Выхожу', remove_keyboard);
    ctx.scene.leave();
});


//-----------------CREATE-USER-FUNCTION--------------------
async function createUser(telegramId, name, surName, department) {
    user = new UserModel({
        telegramId,
        name,
        surName,
        department
    });
    await user.save();
}
//----------------------------------------------------------
async function createTask(title, comment, department, author, maker, deadline, status) {
    task = new TaskModel({
        title,
        comment,
        department,
        author,
        maker,
        deadline,
        status
    });
    await task.save();
}

const bot = new Telegraf(process.env.BOT_TOKEN)
bot.use(session(), stage.middleware())

bot.start(async (ctx) => {
    let userId = ctx.from.id;
    let user = await UserModel.findOne({telegramId: `${userId}`});
    if (user) return ctx.reply('Welcome');

    ctx.session.telegramId = userId;
    ctx.scene.enter('infoScene');
    
    console.log(ctx.session.telegramId);
})
bot.command('/info', ctx => {
    console.log(ctx.session);
    ctx.reply(`${ctx.session.user}, ${ctx.session.title}, ${ctx.session.comment}, ${ctx.session.maker}, ${ctx.session.deadline}`)
});
bot.command('/tasks', async ctx => {
    const telegramId = ctx.from.id;
    
    const user = await UserModel.findOne({telegramId})
    ctx.session.user = user;
    console.log(ctx.session.user);
    ctx.scene.enter('taskScene');
});
bot.on('text', ctx => {
    ctx.reply('Выберите пожалуйста одну из команд')})
bot.launch()


